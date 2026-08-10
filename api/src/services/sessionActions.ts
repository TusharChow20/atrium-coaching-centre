import { withSerializableTransaction, query } from "../db";
import { fitsOpeningHours } from "../lib/centreTime";
import {
  coachRefundPercent,
  durationMinutes,
  hoursOfNotice,
  refundAmount,
} from "../credits";

export class ServiceError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus = 400) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

export type Caller = { id: number; kind: "admin" | "coach" | "participant" };

function assertCanActOnSession(caller: Caller, session: any) {
  if (caller.kind !== "admin" && session.coach_id !== caller.id) {
    throw new ServiceError("you can only act on your own sessions", 403);
  }
}

export async function cancelSessionShared(caller: Caller, sessionId: number) {
  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ServiceError("no such session", 404);

  assertCanActOnSession(caller, session);

  if (session.status === "cancelled") {
    throw new ServiceError("that session is already cancelled", 409);
  }
  if (new Date(session.starts_at).getTime() <= Date.now()) {
    throw new ServiceError(
      "that session has already started and can no longer be cancelled",
      409,
    );
  }

  const percent = coachRefundPercent(
    hoursOfNotice(new Date(), new Date(session.starts_at)),
  );
  const roomRefund = refundAmount(Number(session.room_fee_credits), percent);

  const summary = await withSerializableTransaction(async (client) => {
    const enrolments = await client.query(
      `select e.id, e.person_id, e.credits_charged, p.email, p.full_name
         from enrolment e join person p on p.id = e.person_id
        where e.session_id = $1 and e.status = 'active'`,
      [sessionId],
    );

    let seatsRefunded = 0;
    const notified: { email: string; full_name: string }[] = [];

    for (const e of enrolments.rows) {
      const refund = Number(e.credits_charged);
      await client.query(
        `update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now()
         where id = $2`,
        [refund, e.id],
      );
      await client.query(
        "update person set credits = credits + $1 where id = $2",
        [refund, e.person_id],
      );
      seatsRefunded += refund;
      notified.push({ email: e.email, full_name: e.full_name });
    }

    await client.query(
      "update person set credits = credits + $1 where id = $2",
      [roomRefund, session.coach_id],
    );
    await client.query(
      "update session set status = 'cancelled' where id = $1",
      [sessionId],
    );

    return { enrolments: enrolments.rowCount ?? 0, seatsRefunded, notified };
  });

  return { session, percent, roomRefund, summary };
}

export async function rescheduleSessionShared(
  caller: Caller,
  sessionId: number,
  newStartsAt: Date,
) {
  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ServiceError("no such session", 404);

  assertCanActOnSession(caller, session);

  if (session.status !== "scheduled") {
    throw new ServiceError("only a scheduled session can be rescheduled", 409);
  }
  if (Number.isNaN(newStartsAt.getTime())) {
    throw new ServiceError("new_starts_at is not a valid date", 400);
  }

  const endsAt = new Date(
    newStartsAt.getTime() + durationMinutes(session.session_type) * 60_000,
  );

  if (!fitsOpeningHours(newStartsAt, endsAt)) {
    throw new ServiceError(
      "the centre is closed at that time, or the session would run past close",
      400,
    );
  }

  const updated = await withSerializableTransaction(async (client) => {
    const conflict = await client.query(
      `select 1 from session
        where status = 'scheduled' and id <> $4
          and starts_at < $2 and ends_at > $1
          and (coach_id = $3 or exists (
            select 1 from enrolment e where e.session_id = session.id
              and e.person_id = $3 and e.status = 'active'
          ))
        limit 1`,
      [newStartsAt, endsAt, session.coach_id, sessionId],
    );
    if ((conflict.rowCount ?? 0) > 0) {
      throw new ServiceError(
        "that new time conflicts with an existing commitment",
        409,
      );
    }

    try {
      const result = await client.query(
        "update session set starts_at = $1, ends_at = $2 where id = $3 returning *",
        [newStartsAt, endsAt, sessionId],
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === "23P01") {
        throw new ServiceError(
          "that room is already booked for the new time",
          409,
        );
      }
      throw err;
    }
  });

  const affected = await query<{ email: string }>(
    `select p.email from enrolment e join person p on p.id = e.person_id
      where e.session_id = $1 and e.status = 'active'`,
    [sessionId],
  );

  return { session, updated, affected };
}
