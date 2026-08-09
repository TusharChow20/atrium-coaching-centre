import { Router } from "express";
import { query, withSerializableTransaction } from "../db";
import { requireSession, attachRole, requireRole } from "../auth";
import { fitsOpeningHours } from "../lib/centreTime";
import {
  coachRefundPercent,
  durationMinutes,
  hoursOfNotice,
  isValidSessionType,
  refundAmount,
  roomFee,
} from "../credits";

const router = Router();

const MIN_BOOKING_NOTICE_HOURS = 48;

router.get("/", async (req, res) => {
  try {
    const from =
      typeof req.query.from === "string" && req.query.from
        ? req.query.from
        : new Date().toISOString();
    const to =
      typeof req.query.to === "string" && req.query.to ? req.query.to : null;

    const params: unknown[] = [from];
    let sql = `select id, room_id, coach_id, discipline, session_type, status,
                      starts_at, ends_at, room_fee_credits, seat_fee_credits
                 from session
                where starts_at >= $1
                  and status <> 'cancelled'`;

    if (to) {
      params.push(to);
      sql += ` and starts_at < $${params.length}`;
    }
    sql += " order by starts_at";

    const sessions = await query(sql, params);
    const feed = [];

    for (const session of sessions) {
      const rooms = await query(
        "select id, name, capacity from room where id = $1",
        [session.room_id],
      );
      const coaches = await query(
        "select id, full_name from person where id = $1",
        [session.coach_id],
      );
      const enrolled = await query(
        "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
        [session.id],
      );

      const capacity = rooms.length > 0 ? rooms[0].capacity : 0;
      const taken = enrolled[0].count;

      feed.push({
        ...session,
        room_name: rooms.length > 0 ? rooms[0].name : null,
        room_capacity: capacity,
        coach_name: coaches.length > 0 ? coaches[0].full_name : null,
        enrolled_count: taken,
        places_remaining: capacity - taken,
      });
    }

    res.json(feed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the calendar" });
  }
});

//Section 7
// admin: acceess everything
// the session own coach: attented students list
// an enrolled participant: only their own enrolment row, never others
// anyone else with a session: session facts, no attendee list
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: "no such session" });
      return;
    }

    const sessions = await query("select * from session where id = $1", [id]);
    if (sessions.length === 0) {
      res.status(404).json({ error: "no such session" });
      return;
    }
    const session = sessions[0];

    const rooms = await query(
      "select id, name, capacity from room where id = $1",
      [session.room_id],
    );
    const coaches = await query(
      "select id, full_name from person where id = $1",
      [session.coach_id],
    );

    const base = {
      ...session,
      room: rooms[0] ?? null,
      coach: coaches[0] ?? null,
    };

    // Figure out who's asking, without requiring auth (public callers get `base` only).
    const cookie = req.cookies ? req.cookies["atrium_session"] : undefined;
    let personId: number | null = null;
    let kind: string | null = null;

    if (cookie) {
      const { readSession } = await import("../auth");
      const session_ = readSession(cookie);
      if (session_) {
        const people = await query(
          "select kind, active from person where id = $1",
          [session_.personId],
        );
        if (people.length > 0 && people[0].active) {
          personId = session_.personId;
          kind = people[0].kind;
        }
      }
    }

    if (
      kind === "admin" ||
      (kind === "coach" && personId === session.coach_id)
    ) {
      const attendees = await query(
        `select e.id, e.status, e.credits_charged, e.credits_refunded, e.enrolled_at, e.cancelled_at,
                p.id as person_id, p.full_name, p.email
           from enrolment e
           join person p on p.id = e.person_id
          where e.session_id = $1
          order by e.id`,
        [id],
      );
      res.json({ ...base, attendees });
      return;
    }

    if (kind === "participant" && personId) {
      const own = await query(
        `select id, status, credits_charged, credits_refunded, enrolled_at, cancelled_at
           from enrolment where session_id = $1 and person_id = $2`,
        [id, personId],
      );
      res.json({ ...base, my_enrolment: own[0] ?? null });
      return;
    }

    res.json(base);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the session" });
  }
});

router.post(
  "/",
  requireSession,
  attachRole,
  requireRole("coach", "admin"),
  async (req, res) => {
    try {
      const body = req.body || {};
      const { room_id, discipline, session_type, starts_at } = body;
      const requesterId = res.locals.personId as number;
      const requesterKind = res.locals.personKind as string;

      const coach_id =
        requesterKind === "admin" && body.coach_id
          ? Number(body.coach_id)
          : requesterId;

      if (!room_id || !discipline || !session_type || !starts_at) {
        res
          .status(400)
          .json({
            error:
              "room_id, discipline, session_type and starts_at are all required",
          });
        return;
      }

      if (!isValidSessionType(session_type)) {
        res
          .status(400)
          .json({ error: "session_type must be short, standard or intensive" });
        return;
      }

      const startsAtDate = new Date(starts_at);
      if (Number.isNaN(startsAtDate.getTime())) {
        res.status(400).json({ error: "starts_at is not a valid date" });
        return;
      }

      const endsAtDate = new Date(
        startsAtDate.getTime() + durationMinutes(session_type) * 60_000,
      );

      if (!fitsOpeningHours(startsAtDate, endsAtDate)) {
        res
          .status(400)
          .json({
            error:
              "the centre is closed at that time, or the session would run past close",
          });
        return;
      }

      const noticeHours = hoursOfNotice(new Date(), startsAtDate);
      if (noticeHours < MIN_BOOKING_NOTICE_HOURS) {
        res
          .status(400)
          .json({
            error:
              "a session must be booked at least 48 hours before it starts",
          });
        return;
      }

      const rooms = await query(
        "select id, name, capacity from room where id = $1",
        [room_id],
      );
      if (rooms.length === 0) {
        res.status(400).json({ error: "no such room" });
        return;
      }

      const coaches = await query(
        "select id, credits from person where id = $1 and kind = 'coach' and active",
        [coach_id],
      );
      if (coaches.length === 0) {
        res.status(400).json({ error: "no such coach" });
        return;
      }

      const fee = roomFee(session_type);
      if (coaches[0].credits < fee) {
        res
          .status(400)
          .json({ error: "insufficient credits to book this room" });
        return;
      }

      const created = await withSerializableTransaction(async (client) => {
        const conflict = await client.query(
          `select 1 from session
          where status = 'scheduled'
            and starts_at < $2 and ends_at > $1
            and (
              coach_id = $3
              or exists (
                select 1 from enrolment e
                 where e.session_id = session.id and e.person_id = $3 and e.status = 'active'
              )
            )
          limit 1`,
          [startsAtDate, endsAtDate, coach_id],
        );

        if ((conflict.rowCount ?? 0) > 0) {
          throw Object.assign(new Error("coach has a conflicting commitment"), {
            httpStatus: 409,
          });
        }

        try {
          const inserted = await client.query(
            `insert into session
             (room_id, coach_id, discipline, session_type, status, starts_at, ends_at,
              room_fee_credits, seat_fee_credits)
           values ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8)
           returning *`,
            [
              room_id,
              coach_id,
              discipline,
              session_type,
              startsAtDate,
              endsAtDate,
              fee,
              seatFeeFor(session_type),
            ],
          );

          await client.query(
            "update person set credits = credits - $1 where id = $2",
            [fee, coach_id],
          );

          return inserted.rows[0];
        } catch (err: any) {
          // 23P01 = exclusion_violation — the room-overlap constraint from the migration
          if (err.code === "23P01") {
            throw Object.assign(
              new Error(`${rooms[0].name} is already booked for that time`),
              { httpStatus: 409 },
            );
          }
          throw err;
        }
      });

      res.status(201).json(created);
    } catch (err: any) {
      if (err && err.httpStatus) {
        res.status(err.httpStatus).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "could not create the session" });
    }
  },
);

// Reschedule only (Section 10)
router.patch(
  "/:id",
  requireSession,
  attachRole,
  requireRole("coach", "admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const requesterId = res.locals.personId as number;
      const requesterKind = res.locals.personKind as string;
      const newStartsAt = req.body ? req.body.starts_at : undefined;

      if (!Number.isInteger(id) || !newStartsAt) {
        res.status(400).json({ error: "starts_at is required" });
        return;
      }

      const sessions = await query("select * from session where id = $1", [id]);
      if (sessions.length === 0) {
        res.status(404).json({ error: "no such session" });
        return;
      }
      const session = sessions[0];

      if (requesterKind !== "admin" && session.coach_id !== requesterId) {
        res
          .status(403)
          .json({ error: "you can only reschedule your own sessions" });
        return;
      }
      if (session.status !== "scheduled") {
        res
          .status(409)
          .json({ error: "only a scheduled session can be rescheduled" });
        return;
      }

      const startsAtDate = new Date(newStartsAt);
      if (Number.isNaN(startsAtDate.getTime())) {
        res.status(400).json({ error: "starts_at is not a valid date" });
        return;
      }
      const endsAtDate = new Date(
        startsAtDate.getTime() + durationMinutes(session.session_type) * 60_000,
      );

      if (!fitsOpeningHours(startsAtDate, endsAtDate)) {
        res
          .status(400)
          .json({
            error:
              "the centre is closed at that time, or the session would run past close",
          });
        return;
      }

      const updated = await withSerializableTransaction(async (client) => {
        const conflict = await client.query(
          `select 1 from session
          where status = 'scheduled' and id <> $4
            and starts_at < $2 and ends_at > $1
            and (
              coach_id = $3
              or exists (
                select 1 from enrolment e
                 where e.session_id = session.id and e.person_id = $3 and e.status = 'active'
              )
            )
          limit 1`,
          [startsAtDate, endsAtDate, session.coach_id, id],
        );
        if ((conflict.rowCount ?? 0) > 0) {
          throw Object.assign(
            new Error("that new time conflicts with an existing commitment"),
            { httpStatus: 409 },
          );
        }

        try {
          const result = await client.query(
            "update session set starts_at = $1, ends_at = $2 where id = $3 returning *",
            [startsAtDate, endsAtDate, id],
          );
          return result.rows[0];
        } catch (err: any) {
          if (err.code === "23P01") {
            throw Object.assign(
              new Error("that room is already booked for the new time"),
              { httpStatus: 409 },
            );
          }
          throw err;
        }
      });

      // TODO (Phase 5): notify every enrolled participant of the new time — see plan doc.
      res.json(updated);
    } catch (err: any) {
      if (err && err.httpStatus) {
        res.status(err.httpStatus).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "could not reschedule the session" });
    }
  },
);

router.post(
  "/:id/cancel",
  requireSession,
  attachRole,
  requireRole("coach", "admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const requesterId = res.locals.personId as number;
      const requesterKind = res.locals.personKind as string;

      if (!Number.isInteger(id)) {
        res.status(404).json({ error: "no such session" });
        return;
      }

      const sessions = await query("select * from session where id = $1", [id]);
      if (sessions.length === 0) {
        res.status(404).json({ error: "no such session" });
        return;
      }
      const session = sessions[0];

      if (requesterKind !== "admin" && session.coach_id !== requesterId) {
        res
          .status(403)
          .json({ error: "you can only cancel your own sessions" });
        return;
      }
      if (session.status === "cancelled") {
        res.status(409).json({ error: "that session is already cancelled" });
        return;
      }

      const percent = coachRefundPercent(
        hoursOfNotice(new Date(), new Date(session.starts_at)),
      );
      const roomRefund = refundAmount(
        Number(session.room_fee_credits),
        percent,
      );

      const summary = await withSerializableTransaction(async (client) => {
        const enrolments = await client.query(
          "select id, person_id, credits_charged from enrolment where session_id = $1 and status = 'active'",
          [id],
        );

        let seatsRefunded = 0;

        for (const enrolment of enrolments.rows) {
          // Full refund for every affected participant the coach did (Section 6)
          const refund = Number(enrolment.credits_charged);

          await client.query(
            `update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now() where id = $2`,
            [refund, enrolment.id],
          );
          await client.query(
            "update person set credits = credits + $1 where id = $2",
            [refund, enrolment.person_id],
          );
          seatsRefunded += refund;
        }

        await client.query(
          "update person set credits = credits + $1 where id = $2",
          [roomRefund, session.coach_id],
        );
        await client.query(
          "update session set status = 'cancelled' where id = $1",
          [id],
        );

        return { enrolments: enrolments.rowCount, seatsRefunded };
      });

      // TODO  notify admin + every affected participant
      res.json({
        id,
        status: "cancelled",
        refund_percent: percent,
        room_fee_refunded: roomRefund,
        enrolments_cancelled: summary.enrolments,
        seat_fees_refunded: summary.seatsRefunded,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "could not cancel the session" });
    }
  },
);

function seatFeeFor(sessionType: string): number {
  const { seatFee } = require("../credits");
  return seatFee(sessionType);
}

export default router;
