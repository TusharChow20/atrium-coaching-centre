import { Router } from "express";
import { query, withSerializableTransaction } from "../db";
import { requireSession, attachRole, requireRole } from "../auth";
import {
  hoursOfNotice,
  participantRefundPercent,
  refundAmount,
  seatFee,
} from "../credits";
import { sendMail } from "../mailer";

const router = Router();

// a participant sees only their own bookings only
router.get(
  "/mine",
  requireSession,
  attachRole,
  requireRole("participant"),
  async (req, res) => {
    try {
      const personId = res.locals.personId as number;
      const rows = await query(
        `select e.id, e.status, e.credits_charged, e.credits_refunded, e.enrolled_at, e.cancelled_at,
              s.id as session_id, s.discipline, s.session_type, s.status as session_status,
              s.starts_at, s.ends_at, r.name as room_name
         from enrolment e
         join session s on s.id = e.session_id
         join room r on r.id = s.room_id
        where e.person_id = $1
        order by s.starts_at desc`,
        [personId],
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "could not load your bookings" });
    }
  },
);

router.post(
  "/sessions/:sessionId/enrol",
  requireSession,
  attachRole,
  requireRole("participant"),
  async (req, res) => {
    try {
      const sessionId = Number(req.params.sessionId);
      const personId = res.locals.personId as number;
      if (!Number.isInteger(sessionId)) {
        res.status(404).json({ error: "no such session" });
        return;
      }

      const sessions = await query("select * from session where id = $1", [
        sessionId,
      ]);
      if (sessions.length === 0) {
        res.status(404).json({ error: "no such session" });
        return;
      }
      const session = sessions[0];

      if (session.status !== "scheduled") {
        res.status(409).json({ error: "that session is not open for booking" });
        return;
      }
      if (new Date(session.starts_at).getTime() <= Date.now()) {
        res.status(409).json({ error: "that session has already started" });
        return;
      }
      if (session.coach_id === personId) {
        res
          .status(400)
          .json({ error: "a coach may not enrol in their own session" });
        return;
      }

      const people = await query(
        "select credits from person where id = $1 and kind = 'participant' and active",
        [personId],
      );
      if (people.length === 0) {
        res.status(400).json({ error: "participant account not found" });
        return;
      }

      const fee = seatFee(session.session_type);
      if (people[0].credits < fee) {
        res
          .status(400)
          .json({ error: "insufficient credits to book this place" });
        return;
      }

      const rooms = await query("select capacity from room where id = $1", [
        session.room_id,
      ]);
      const capacity = rooms[0]?.capacity ?? 0;

      const created = await withSerializableTransaction(async (client) => {
        const taken = await client.query(
          "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
          [sessionId],
        );
        if (taken.rows[0].count >= capacity) {
          throw Object.assign(new Error("that session is full"), {
            httpStatus: 409,
          });
        }

        const conflict = await client.query(
          `select 1 from session
          where status = 'scheduled'
            and starts_at < $2 and ends_at > $1
            and (
              coach_id = $3
              or exists (
                select 1 from enrolment e where e.session_id = session.id and e.person_id = $3 and e.status = 'active'
              )
            )
          limit 1`,
          [session.starts_at, session.ends_at, personId],
        );
        if ((conflict.rowCount ?? 0) > 0) {
          throw Object.assign(
            new Error("you have a conflicting commitment at that time"),
            { httpStatus: 409 },
          );
        }

        try {
          const inserted = await client.query(
            `insert into enrolment (session_id, person_id, status, credits_charged, enrolled_at)
           values ($1, $2, 'active', $3, now()) returning *`,
            [sessionId, personId, fee],
          );
          await client.query(
            "update person set credits = credits - $1 where id = $2",
            [fee, personId],
          );
          return inserted.rows[0];
        } catch (err: any) {
          if (err.code === "23505") {
            throw Object.assign(
              new Error("you are already booked into that session"),
              { httpStatus: 409 },
            );
          }
          throw err;
        }
      });

      const [coach] = await query<{ email: string; full_name: string }>(
        "select email, full_name from person where id = $1",
        [session.coach_id],
      );
      const [participant] = await query<{ full_name: string }>(
        "select full_name from person where id = $1",
        [personId],
      );
      if (coach) {
        await sendMail(
          coach.email,
          "New booking for your session",
          `${participant?.full_name ?? "A participant"} booked a place in your ${session.discipline} session on ${new Date(session.starts_at).toLocaleString()}.`,
        );
      }

      res.status(201).json(created);
    } catch (err: any) {
      if (err && err.httpStatus) {
        res.status(err.httpStatus).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "could not book that place" });
    }
  },
);

router.post(
  "/:id/cancel",
  requireSession,
  attachRole,
  requireRole("participant", "admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const requesterId = res.locals.personId as number;
      const requesterKind = res.locals.personKind as string;
      if (!Number.isInteger(id)) {
        res.status(404).json({ error: "no such booking" });
        return;
      }

      const rows = await query(
        `select e.*, s.starts_at, s.status as session_status
         from enrolment e join session s on s.id = e.session_id
        where e.id = $1`,
        [id],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "no such booking" });
        return;
      }
      const enrolment = rows[0];

      if (requesterKind !== "admin" && enrolment.person_id !== requesterId) {
        res.status(403).json({ error: "you can only cancel your own booking" });
        return;
      }
      if (enrolment.status === "cancelled") {
        res.status(409).json({ error: "that booking is already cancelled" });
        return;
      }

      const percent = participantRefundPercent(
        hoursOfNotice(new Date(), new Date(enrolment.starts_at)),
      );
      const refund = refundAmount(Number(enrolment.credits_charged), percent);

      await withSerializableTransaction(async (client) => {
        await client.query(
          `update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now() where id = $2`,
          [refund, id],
        );
        await client.query(
          "update person set credits = credits + $1 where id = $2",
          [refund, enrolment.person_id],
        );
      });

      const [sessionInfo] = await query<{
        coach_id: number;
        discipline: string;
        starts_at: string;
      }>("select coach_id, discipline, starts_at from session where id = $1", [
        enrolment.session_id,
      ]);
      if (sessionInfo) {
        const [coach] = await query<{ email: string }>(
          "select email from person where id = $1",
          [sessionInfo.coach_id],
        );
        if (coach) {
          await sendMail(
            coach.email,
            "A participant cancelled their booking",
            `A booking for your ${sessionInfo.discipline} session on ${new Date(sessionInfo.starts_at).toLocaleString()} was cancelled.`,
          );
        }
      }

      res.json({
        id,
        status: "cancelled",
        refund_percent: percent,
        credits_refunded: refund,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "could not cancel that booking" });
    }
  },
);

export default router;
