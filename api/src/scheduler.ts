import cron from "node-cron";
import { DateTime } from "luxon";
import { query } from "./db";
import { sendMail, getAdminEmails } from "./mailer";
import { CENTRE_TIMEZONE, centreLocalDayBounds } from "./lib/centreTime";

function todayCentreLocalDate(): string {
  return DateTime.now().setZone(CENTRE_TIMEZONE).toISODate()!;
}

async function sendCoachDailyDigests() {
  const { startUtc, endUtc } = centreLocalDayBounds(todayCentreLocalDate());

  const rows = await query<{
    coach_id: number;
    email: string;
    full_name: string;
    discipline: string;
    session_type: string;
    starts_at: string;
    room_name: string;
  }>(
    `select s.coach_id, p.email, p.full_name, s.discipline, s.session_type, s.starts_at, r.name as room_name
       from session s
       join person p on p.id = s.coach_id
       join room r on r.id = s.room_id
      where s.status = 'scheduled'
        and s.starts_at >= $1 and s.starts_at < $2
      order by p.id, s.starts_at`,
    [startUtc, endUtc],
  );

  const byCoach = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!byCoach.has(row.coach_id)) byCoach.set(row.coach_id, []);
    byCoach.get(row.coach_id)!.push(row);
  }

  // a coach with none receives no email at all
  for (const [, sessions] of byCoach) {
    const { email, full_name } = sessions[0];
    const lines = sessions.map(
      (s) =>
        `- ${s.discipline} (${s.session_type}) at ${new Date(s.starts_at).toLocaleTimeString()} in ${s.room_name}`,
    );
    await sendMail(
      email,
      "Your sessions today",
      `Hi ${full_name},\n\nYou have ${sessions.length} session(s) today:\n\n${lines.join("\n")}`,
    );
  }
}

async function sendAdminDailyDigest() {
  const { startUtc, endUtc } = centreLocalDayBounds(todayCentreLocalDate());

  const sessions = await query<{
    id: number;
    discipline: string;
    starts_at: string;
    coach_name: string;
  }>(
    `select s.id, s.discipline, s.starts_at, p.full_name as coach_name
       from session s join person p on p.id = s.coach_id
      where s.status = 'scheduled' and s.starts_at >= $1 and s.starts_at < $2
      order by s.starts_at`,
    [startUtc, endUtc],
  );

  const attendances = await query<{ count: string }>(
    `select count(*)::text as count
       from enrolment e join session s on s.id = e.session_id
      where e.status = 'active' and s.starts_at >= $1 and s.starts_at < $2`,
    [startUtc, endUtc],
  );

  const lines = sessions.map(
    (s) =>
      `- ${s.discipline} at ${new Date(s.starts_at).toLocaleTimeString()} with ${s.coach_name}`,
  );

  const body =
    `Today's bookings (${sessions.length}) and attendances (${attendances[0]?.count ?? 0}):\n\n` +
    (lines.length ? lines.join("\n") : "No sessions scheduled today.");

  const admins = await getAdminEmails();
  for (const email of admins) {
    await sendMail(email, "Daily bookings digest", body);
  }
}

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log("scheduler disabled via SCHEDULER_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 0 * * *",
    () => {
      sendCoachDailyDigests().catch((err) =>
        console.error("coach digest failed", err),
      );
      sendAdminDailyDigest().catch((err) =>
        console.error("admin digest failed", err),
      );
    },
    { timezone: CENTRE_TIMEZONE },
  );

  console.log(`scheduler started — daily digests at 00:00 ${CENTRE_TIMEZONE}`);
}
