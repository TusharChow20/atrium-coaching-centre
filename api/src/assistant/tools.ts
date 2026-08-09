import { query, withSerializableTransaction } from "../db";
import { fitsOpeningHours } from "../lib/centreTime";
import {
  coachRefundPercent,
  durationMinutes,
  hoursOfNotice,
  isValidSessionType,
  participantRefundPercent,
  refundAmount,
  roomFee,
  seatFee,
} from "../credits";
import { sendMail, getAdminEmails } from "../mailer";
import { hashPassword } from "../auth";
import { issuePasswordSetToken } from "../tokens";
import type { ToolDefinition } from "./provider";

export type Caller =
  | { kind: "anonymous" }
  | { kind: "participant"; personId: number }
  | { kind: "coach"; personId: number }
  | { kind: "admin"; personId: number };

class ToolError extends Error {}

function assertRole(caller: Caller, allowed: Caller["kind"][]) {
  if (!allowed.includes(caller.kind)) {
    throw new ToolError(`not permitted for your role (${caller.kind})`);
  }
}

// Shared catalogue search. Safe for anyone never includes attendee data--------------------
async function searchSessions(args: {
  from?: string;
  to?: string;
  discipline?: string;
}) {
  const from = args.from ? new Date(args.from) : new Date();
  if (Number.isNaN(from.getTime()))
    throw new ToolError("from is not a valid date");

  const params: unknown[] = [from];
  let sql = `select id, room_id, coach_id, discipline, session_type, status,
                    starts_at, ends_at, seat_fee_credits
               from session
              where starts_at >= $1 and status <> 'cancelled'`;
  if (args.to) {
    const to = new Date(args.to);
    if (Number.isNaN(to.getTime()))
      throw new ToolError("to is not a valid date");
    params.push(to);
    sql += ` and starts_at < $${params.length}`;
  }
  if (args.discipline) {
    params.push(args.discipline);
    sql += ` and discipline = $${params.length}`;
  }
  sql += " order by starts_at limit 8";

  const sessions = await query<any>(sql, params);
  const out = [];
  for (const s of sessions) {
    const [room] = await query<{ name: string; capacity: number }>(
      "select name, capacity from room where id = $1",
      [s.room_id],
    );
    const [coach] = await query<{ full_name: string }>(
      "select full_name from person where id = $1",
      [s.coach_id],
    );
    const [{ count }] = await query<{ count: number }>(
      "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
      [s.id],
    );
    out.push({
      id: s.id,
      discipline: s.discipline,
      session_type: s.session_type,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      room_name: room?.name ?? null,
      coach_name: coach?.full_name ?? null,
      seat_fee_credits: s.seat_fee_credits,
      places_remaining: (room?.capacity ?? 0) - count,
    });
  }
  return out;
}

// Anonymous book a place -> supplying only an email -> Creates the account---------
async function bookAsNewParticipant(args: {
  email: string;
  session_id: number;
}) {
  const { email, session_id: sessionId } = args;
  if (!email || !Number.isInteger(sessionId)) {
    throw new ToolError("email and session_id are required");
  }

  const existing = await query<{ id: number }>(
    "select id from person where email = $1",
    [email],
  );
  if (existing.length > 0) {
    throw new ToolError(
      "an account already exists for that email — please log in to book instead",
    );
  }

  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ToolError("no such session");
  if (session.status !== "scheduled")
    throw new ToolError("that session is not open for booking");
  if (new Date(session.starts_at).getTime() <= Date.now()) {
    throw new ToolError("that session has already started");
  }

  const fee = seatFee(session.session_type);
  const [room] = await query<{ capacity: number }>(
    "select capacity from room where id = $1",
    [session.room_id],
  );
  const capacity = room?.capacity ?? 0;

  const result = await withSerializableTransaction(async (client) => {
    const person = await client.query(
      `insert into person (email, password_hash, full_name, kind, credits, active, created_at)
       values ($1, '', $2, 'participant', 4000, true, now()) returning id`,
      [email, email.split("@")[0]],
    );
    const personId = person.rows[0].id;

    const taken = await client.query(
      "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
      [sessionId],
    );
    if (taken.rows[0].count >= capacity) {
      throw new ToolError("that session is full");
    }
    if (fee > 4000)
      throw new ToolError("insufficient credits to book this place");

    await client.query(
      `insert into enrolment (session_id, person_id, status, credits_charged, enrolled_at)
       values ($1, $2, 'active', $3, now())`,
      [sessionId, personId, fee],
    );
    await client.query(
      "update person set credits = credits - $1 where id = $2",
      [fee, personId],
    );

    return { personId };
  });

  const [coach] = await query<{ email: string }>(
    "select email from person where id = $1",
    [session.coach_id],
  );
  if (coach) {
    await sendMail(
      coach.email,
      "New booking for your session",
      `A new participant booked a place in your ${session.discipline} session on ${new Date(session.starts_at).toLocaleString()}.`,
    );
  }

  const rawToken = await issuePasswordSetToken(result.personId);
  await sendMail(
    email,
    "Set your Atrium password",
    `Your booking is confirmed. Set a password for your new account here: ` +
      `${process.env.WEB_BASE_URL || "http://localhost:3000"}/set-password?person_id=${result.personId}&token=${rawToken}`,
  );

  return { booked: true, session_id: sessionId, account_email: email };
}

// Participant-----------------------------------------
async function getMyCredits(caller: Caller) {
  assertRole(caller, ["participant", "coach", "admin"]);
  const personId = (caller as any).personId;
  const [row] = await query<{ credits: number }>(
    "select credits from person where id = $1",
    [personId],
  );
  return { credits: row?.credits ?? 0 };
}

async function getMyBookings(caller: Caller) {
  assertRole(caller, ["participant"]);
  const personId = (caller as any).personId;
  return query(
    `select e.id, e.status, e.credits_charged, e.credits_refunded, e.enrolled_at, e.cancelled_at,
            s.id as session_id, s.discipline, s.session_type, s.status as session_status,
            s.starts_at, s.ends_at, r.name as room_name
       from enrolment e join session s on s.id = e.session_id join room r on r.id = s.room_id
      where e.person_id = $1
      order by s.starts_at desc limit 25`,
    [personId],
  );
}

async function bookSession(caller: Caller, args: { session_id: number }) {
  assertRole(caller, ["participant"]);
  const personId = (caller as any).personId;
  const sessionId = args.session_id;
  if (!Number.isInteger(sessionId))
    throw new ToolError("session_id is required");

  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ToolError("no such session");
  if (session.status !== "scheduled")
    throw new ToolError("that session is not open for booking");
  if (new Date(session.starts_at).getTime() <= Date.now()) {
    throw new ToolError("that session has already started");
  }
  if (session.coach_id === personId)
    throw new ToolError("a coach may not enrol in their own session");

  const [person] = await query<{ credits: number }>(
    "select credits from person where id = $1 and kind = 'participant' and active",
    [personId],
  );
  if (!person) throw new ToolError("participant account not found");

  const fee = seatFee(session.session_type);
  if (person.credits < fee)
    throw new ToolError("insufficient credits to book this place");

  const [room] = await query<{ capacity: number }>(
    "select capacity from room where id = $1",
    [session.room_id],
  );
  const capacity = room?.capacity ?? 0;

  await withSerializableTransaction(async (client) => {
    const taken = await client.query(
      "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
      [sessionId],
    );
    if (taken.rows[0].count >= capacity)
      throw new ToolError("that session is full");

    const conflict = await client.query(
      `select 1 from session
        where status = 'scheduled' and starts_at < $2 and ends_at > $1
          and (coach_id = $3 or exists (
            select 1 from enrolment e where e.session_id = session.id and e.person_id = $3 and e.status = 'active'
          ))
        limit 1`,
      [session.starts_at, session.ends_at, personId],
    );
    if ((conflict.rowCount ?? 0) > 0) {
      throw new ToolError("you have a conflicting commitment at that time");
    }

    try {
      await client.query(
        `insert into enrolment (session_id, person_id, status, credits_charged, enrolled_at)
         values ($1, $2, 'active', $3, now())`,
        [sessionId, personId, fee],
      );
      await client.query(
        "update person set credits = credits - $1 where id = $2",
        [fee, personId],
      );
    } catch (err: any) {
      if (err.code === "23505")
        throw new ToolError("you are already booked into that session");
      throw err;
    }
  });

  const [coach] = await query<{ email: string }>(
    "select email from person where id = $1",
    [session.coach_id],
  );
  if (coach) {
    await sendMail(
      coach.email,
      "New booking for your session",
      `A participant booked a place in your ${session.discipline} session on ${new Date(session.starts_at).toLocaleString()}.`,
    );
  }

  return { booked: true, session_id: sessionId, credits_charged: fee };
}

async function cancelBooking(caller: Caller, args: { enrolment_id: number }) {
  assertRole(caller, ["participant"]);
  const personId = (caller as any).personId;
  const id = args.enrolment_id;
  if (!Number.isInteger(id)) throw new ToolError("enrolment_id is required");

  const [enrolment] = await query<any>(
    `select e.*, s.starts_at from enrolment e join session s on s.id = e.session_id where e.id = $1`,
    [id],
  );
  if (!enrolment) throw new ToolError("no such booking");
  // The ownership check to make the tool secure
  if (enrolment.person_id !== personId)
    throw new ToolError("you can only cancel your own booking");
  if (enrolment.status === "cancelled")
    throw new ToolError("that booking is already cancelled");

  const percent = participantRefundPercent(
    hoursOfNotice(new Date(), new Date(enrolment.starts_at)),
  );
  const refund = refundAmount(Number(enrolment.credits_charged), percent);

  await withSerializableTransaction(async (client) => {
    await client.query(
      "update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now() where id = $2",
      [refund, id],
    );
    await client.query(
      "update person set credits = credits + $1 where id = $2",
      [refund, personId],
    );
  });

  return { cancelled: true, refund_percent: percent, credits_refunded: refund };
}

// Coach--------------------------------------------------------------

async function getMySessionsDetail(caller: Caller) {
  assertRole(caller, ["coach"]);
  const personId = (caller as any).personId;
  const sessions = await query<any>(
    `select s.*, r.name as room_name from session s join room r on r.id = s.room_id
      where s.coach_id = $1 order by s.starts_at desc limit 25`,
    [personId],
  );
  const withAttendees = [];
  for (const s of sessions) {
    const attendees = await query(
      `select e.id, e.status, e.enrolled_at, e.cancelled_at, p.full_name,
              (select count(*)::int from enrolment e2
                 join session s2 on s2.id = e2.session_id
                where e2.person_id = e.person_id and s2.coach_id = $2 and e2.status = 'cancelled') as prior_cancellations
         from enrolment e join person p on p.id = e.person_id
        where e.session_id = $1 order by e.id`,
      [s.id, personId],
    );
    withAttendees.push({ ...s, attendees });
  }
  return withAttendees;
}

async function getBusyPeriods(caller: Caller) {
  assertRole(caller, ["coach"]);
  const personId = (caller as any).personId;
  return query(
    `select s.id, s.starts_at, s.ends_at, r.name as room_name
       from session s join room r on r.id = s.room_id
      where s.coach_id <> $1 and s.status = 'scheduled' order by s.starts_at limit 50`,
    [personId],
  );
}

async function cancelSession(caller: Caller, args: { session_id: number }) {
  assertRole(caller, ["coach", "admin"]);
  const sessionId = args.session_id;
  if (!Number.isInteger(sessionId))
    throw new ToolError("session_id is required");

  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ToolError("no such session");
  if (
    caller.kind === "coach" &&
    session.coach_id !== (caller as any).personId
  ) {
    throw new ToolError("you can only cancel your own sessions");
  }
  if (session.status === "cancelled")
    throw new ToolError("that session is already cancelled");

  const percent = coachRefundPercent(
    hoursOfNotice(new Date(), new Date(session.starts_at)),
  );
  const roomRefund = refundAmount(Number(session.room_fee_credits), percent);

  const summary = await withSerializableTransaction(async (client) => {
    const enrolments = await client.query(
      `select e.id, e.person_id, e.credits_charged, p.email
         from enrolment e join person p on p.id = e.person_id
        where e.session_id = $1 and e.status = 'active'`,
      [sessionId],
    );
    const notified: string[] = [];
    for (const e of enrolments.rows) {
      const refund = Number(e.credits_charged);
      await client.query(
        "update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now() where id = $2",
        [refund, e.id],
      );
      await client.query(
        "update person set credits = credits + $1 where id = $2",
        [refund, e.person_id],
      );
      notified.push(e.email);
    }
    await client.query(
      "update person set credits = credits + $1 where id = $2",
      [roomRefund, session.coach_id],
    );
    await client.query(
      "update session set status = 'cancelled' where id = $1",
      [sessionId],
    );
    return { notified };
  });

  for (const email of summary.notified) {
    await sendMail(
      email,
      "Your session was cancelled",
      `The ${session.discipline} session you booked for ${new Date(session.starts_at).toLocaleString()} was cancelled by the coach. You have been refunded in full.`,
    );
  }
  const admins = await getAdminEmails();
  for (const email of admins) {
    await sendMail(
      email,
      "A coach cancelled a session",
      `${session.discipline} on ${new Date(session.starts_at).toLocaleString()} was cancelled.`,
    );
  }

  return {
    cancelled: true,
    room_fee_refunded: roomRefund,
    participants_notified: summary.notified.length,
  };
}

async function rescheduleSession(
  caller: Caller,
  args: { session_id: number; new_starts_at: string },
) {
  assertRole(caller, ["coach", "admin"]);
  const sessionId = args.session_id;
  if (!Number.isInteger(sessionId) || !args.new_starts_at) {
    throw new ToolError("session_id and new_starts_at are required");
  }

  const [session] = await query<any>("select * from session where id = $1", [
    sessionId,
  ]);
  if (!session) throw new ToolError("no such session");
  if (
    caller.kind === "coach" &&
    session.coach_id !== (caller as any).personId
  ) {
    throw new ToolError("you can only reschedule your own sessions");
  }
  if (session.status !== "scheduled")
    throw new ToolError("only a scheduled session can be rescheduled");

  const startsAt = new Date(args.new_starts_at);
  if (Number.isNaN(startsAt.getTime()))
    throw new ToolError("new_starts_at is not a valid date");
  const endsAt = new Date(
    startsAt.getTime() + durationMinutes(session.session_type) * 60_000,
  );

  if (!fitsOpeningHours(startsAt, endsAt)) {
    throw new ToolError(
      "the centre is closed at that time, or the session would run past close",
    );
  }

  const updated = await withSerializableTransaction(async (client) => {
    const conflict = await client.query(
      `select 1 from session
        where status = 'scheduled' and id <> $4 and starts_at < $2 and ends_at > $1
          and (coach_id = $3 or exists (
            select 1 from enrolment e where e.session_id = session.id and e.person_id = $3 and e.status = 'active'
          ))
        limit 1`,
      [startsAt, endsAt, session.coach_id, sessionId],
    );
    if ((conflict.rowCount ?? 0) > 0) {
      throw new ToolError(
        "that new time conflicts with an existing commitment",
      );
    }
    try {
      const result = await client.query(
        "update session set starts_at = $1, ends_at = $2 where id = $3 returning *",
        [startsAt, endsAt, sessionId],
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === "23P01")
        throw new ToolError("that room is already booked for the new time");
      throw err;
    }
  });

  const affected = await query<{ email: string }>(
    `select p.email from enrolment e join person p on p.id = e.person_id
      where e.session_id = $1 and e.status = 'active'`,
    [sessionId],
  );
  for (const p of affected) {
    await sendMail(
      p.email,
      "A session you booked was rescheduled",
      `${session.discipline} has moved to ${new Date(updated.starts_at).toLocaleString()}.`,
    );
  }

  return {
    rescheduled: true,
    new_starts_at: updated.starts_at,
    participants_notified: affected.length,
  };
}

// Admin------------------------------------------

async function getSessionAdmin(caller: Caller, args: { session_id: number }) {
  assertRole(caller, ["admin"]);
  const [session] = await query<any>("select * from session where id = $1", [
    args.session_id,
  ]);
  if (!session) throw new ToolError("no such session");
  const attendees = await query(
    `select e.id, e.status, e.credits_charged, e.credits_refunded, p.full_name, p.email
       from enrolment e join person p on p.id = e.person_id where e.session_id = $1`,
    [args.session_id],
  );
  return { ...session, attendees };
}

async function getPersonAdmin(caller: Caller, args: { person_id: number }) {
  assertRole(caller, ["admin"]);
  if (!Number.isInteger(args.person_id))
    throw new ToolError("person_id is required");
  const [person] = await query(
    "select id, email, full_name, kind, credits, active from person where id = $1",
    [args.person_id],
  );
  if (!person) throw new ToolError("no such person");
  return person;
}

async function listPeople(caller: Caller, args: { kind?: string }) {
  assertRole(caller, ["admin"]);
  const params: unknown[] = [];
  let sql = "select id, email, full_name, kind, credits, active from person";
  if (args.kind) {
    params.push(args.kind);
    sql += ` where kind = $${params.length}`;
  }
  sql += " order by full_name limit 100";
  return query(sql, params);
}

// Public tool catalogue, scoped per role---------------------------------------------------
type ToolSpec = {
  def: ToolDefinition;
  handler: (args: any) => Promise<unknown>;
};

export function buildToolsForCaller(caller: Caller): {
  definitions: ToolDefinition[];
  run: (name: string, args: any) => Promise<unknown>;
} {
  const specs: ToolSpec[] = [
    {
      def: {
        name: "search_sessions",
        description:
          "Search upcoming sessions by date range and/or discipline. Public data only.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            discipline: { type: "string" },
          },
        },
      },
      handler: (args) => searchSessions(args),
    },
  ];

  if (caller.kind === "anonymous") {
    specs.push({
      def: {
        name: "book_as_new_participant",
        description:
          "Book a place for a first-time visitor. Creates a participant account for the given email and sends a link to set a password.",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string" },
            session_id: { type: "number" },
          },
          required: ["email", "session_id"],
        },
      },
      handler: (args) => bookAsNewParticipant(args),
    });
  }

  if (
    caller.kind === "participant" ||
    caller.kind === "coach" ||
    caller.kind === "admin"
  ) {
    specs.push({
      def: {
        name: "get_my_credits",
        description: "Get the signed-in person's own current credit balance.",
        parameters: { type: "object", properties: {} },
      },
      handler: () => getMyCredits(caller),
    });
  }

  if (caller.kind === "participant") {
    specs.push(
      {
        def: {
          name: "get_my_bookings",
          description:
            "List the signed-in participant's own bookings, active and cancelled.",
          parameters: { type: "object", properties: {} },
        },
        handler: () => getMyBookings(caller),
      },
      {
        def: {
          name: "book_session",
          description:
            "Book a place in a session for the signed-in participant.",
          parameters: {
            type: "object",
            properties: { session_id: { type: "number" } },
            required: ["session_id"],
          },
        },
        handler: (args) => bookSession(caller, args),
      },
      {
        def: {
          name: "cancel_booking",
          description:
            "Cancel one of the signed-in participant's own bookings by its booking id.",
          parameters: {
            type: "object",
            properties: { enrolment_id: { type: "number" } },
            required: ["enrolment_id"],
          },
        },
        handler: (args) => cancelBooking(caller, args),
      },
    );
  }

  if (caller.kind === "coach") {
    specs.push(
      {
        def: {
          name: "get_my_sessions_detail",
          description:
            "List the signed-in coach's own sessions with full attendee detail, including each attendee's prior cancellation count.",
          parameters: { type: "object", properties: {} },
        },
        handler: () => getMySessionsDetail(caller),
      },
      {
        def: {
          name: "get_busy_periods",
          description:
            "List other coaches' booked time slots as busy periods, with no discipline or attendee detail.",
          parameters: { type: "object", properties: {} },
        },
        handler: () => getBusyPeriods(caller),
      },
      {
        def: {
          name: "cancel_session",
          description: "Cancel one of the signed-in coach's own sessions.",
          parameters: {
            type: "object",
            properties: { session_id: { type: "number" } },
            required: ["session_id"],
          },
        },
        handler: (args) => cancelSession(caller, args),
      },
      {
        def: {
          name: "reschedule_session",
          description:
            "Move one of the signed-in coach's own sessions to a new start time.",
          parameters: {
            type: "object",
            properties: {
              session_id: { type: "number" },
              new_starts_at: { type: "string" },
            },
            required: ["session_id", "new_starts_at"],
          },
        },
        handler: (args) => rescheduleSession(caller, args),
      },
    );
  }

  if (caller.kind === "admin") {
    specs.push(
      {
        def: {
          name: "get_session_admin",
          description: "Get any session with full attendee detail. Admin only.",
          parameters: {
            type: "object",
            properties: { session_id: { type: "number" } },
            required: ["session_id"],
          },
        },
        handler: (args) => getSessionAdmin(caller, args),
      },
      {
        def: {
          name: "get_person_admin",
          description:
            "Look up any person's profile and credit balance by id. Admin only.",
          parameters: {
            type: "object",
            properties: { person_id: { type: "number" } },
            required: ["person_id"],
          },
        },
        handler: (args) => getPersonAdmin(caller, args),
      },
      {
        def: {
          name: "list_people",
          description:
            "List people, optionally filtered by kind (admin/coach/participant). Admin only.",
          parameters: {
            type: "object",
            properties: { kind: { type: "string" } },
          },
        },
        handler: (args) => listPeople(caller, args),
      },
      {
        def: {
          name: "cancel_session",
          description:
            "Cancel any session, regardless of which coach owns it. Admin only.",
          parameters: {
            type: "object",
            properties: { session_id: { type: "number" } },
            required: ["session_id"],
          },
        },
        handler: (args) => cancelSession(caller, args),
      },
      {
        def: {
          name: "reschedule_session",
          description:
            "Reschedule any session, regardless of which coach owns it. Admin only.",
          parameters: {
            type: "object",
            properties: {
              session_id: { type: "number" },
              new_starts_at: { type: "string" },
            },
            required: ["session_id", "new_starts_at"],
          },
        },
        handler: (args) => rescheduleSession(caller, args),
      },
    );
  }

  return {
    definitions: specs.map((s) => s.def),
    run: async (name, args) => {
      const spec = specs.find((s) => s.def.name === name);
      if (!spec)
        throw new ToolError(`tool "${name}" is not available for this caller`);
      try {
        return await spec.handler(args ?? {});
      } catch (err) {
        if (err instanceof ToolError) return { error: err.message };
        console.error(err);
        return { error: "something went wrong running that tool" };
      }
    },
  };
}
