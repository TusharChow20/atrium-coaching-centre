export const dynamic = "force-dynamic";

type Session = {
  id: number;
  discipline: string;
  session_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  room_capacity: number;
  coach_name: string;
  enrolled_count: number;
  places_remaining: number;
};

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

function statusBadge(status: string) {
  const cls =
    status === "scheduled"
      ? "badge-scheduled"
      : status === "cancelled"
        ? "badge-cancelled"
        : "badge-completed";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default async function PublicSessions() {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `${apiBaseUrl}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
    { cache: "no-store" },
  );
  const sessions: Session[] = await res.json();

  return (
    <main className="space-y-10">
      <section>
        <h1 className="text-2xl font-bold text-gray-900">
          Atrium Coaching Centre
        </h1>
        <p className="mt-1 text-gray-600">
          Twelve rooms, open 7:00–21:00 Monday to Saturday (closed Sundays),
          centre time.
        </p>
      </section>

      {/* Fee schedule */}
      <section className="card">
        <h2 className="text-lg font-semibold">Session types and fees</h2>
        <table className="table-base mt-3">
          <thead>
            <tr>
              <th>Type</th>
              <th>Duration</th>
              <th>Room fee (coach pays)</th>
              <th>Seat fee (participant pays)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Short</td>
              <td>45 minutes</td>
              <td>30 credits</td>
              <td>15 credits</td>
            </tr>
            <tr>
              <td>Standard</td>
              <td>60 minutes</td>
              <td>40 credits</td>
              <td>20 credits</td>
            </tr>
            <tr>
              <td>Intensive</td>
              <td>
                180 minutes teaching (room held 210 min — includes a 30-minute
                lunch)
              </td>
              <td>120 credits</td>
              <td>60 credits</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-gray-600">
          New participant accounts start with <strong>4000 credits</strong>; new
          coach accounts start with <strong>2000 credits</strong>. During an
          intensive's lunch interval, neither the coach nor any participant may
          be booked anywhere else in the centre.
        </p>
      </section>

      {/* Coach policy */}
      <section className="card">
        <h2 className="text-lg font-semibold">
          Coach booking &amp; cancellation policy
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          A coach must book a room at least <strong>48 hours</strong> before the
          session starts. If a coach cancels, their room fee is refunded based
          on notice given:
        </p>
        <table className="table-base mt-3">
          <thead>
            <tr>
              <th>Notice before session start</th>
              <th>Refund</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>96 hours or more</td>
              <td>100%</td>
            </tr>
            <tr>
              <td>48 up to 96 hours</td>
              <td>50%</td>
            </tr>
            <tr>
              <td>24 up to 48 hours</td>
              <td>25%</td>
            </tr>
            <tr>
              <td>Under 24 hours</td>
              <td>Nothing</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-gray-600">
          <strong>
            If a coach cancels a session, every participant who had paid to
            attend it is refunded in full
          </strong>{" "}
          — regardless of how much notice the coach gave. You did nothing wrong,
          so you lose nothing.
        </p>
      </section>

      {/* Participant policy */}
      <section className="card">
        <h2 className="text-lg font-semibold">
          Participant cancellation policy
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          If you cancel your own place, your seat fee is refunded based on
          notice given:
        </p>
        <table className="table-base mt-3">
          <thead>
            <tr>
              <th>Notice before session start</th>
              <th>Refund</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>24 hours or more</td>
              <td>100%</td>
            </tr>
            <tr>
              <td>12 up to 24 hours</td>
              <td>50%</td>
            </tr>
            <tr>
              <td>4 up to 12 hours</td>
              <td>25%</td>
            </tr>
            <tr>
              <td>Under 4 hours</td>
              <td>Nothing</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-gray-600">
          A participant's seat fee is much smaller than a coach's room fee, and
          a no-show participant costs the centre a place that could have gone to
          someone else — so the tiers are shorter and steeper than the coach's,
          tightening from 24h down to 4h instead of 96h down to 24h.
        </p>
      </section>

      {/* Sessions list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming sessions</h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Date</th>
                <th>Time</th>
                <th>Type</th>
                <th>Room</th>
                <th>Places remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="capitalize">{session.discipline}</td>
                  <td>{new Date(session.starts_at).toLocaleDateString()}</td>
                  <td>
                    {new Date(session.starts_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {new Date(session.ends_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="capitalize">{session.session_type}</td>
                  <td>{session.room_name}</td>
                  <td>
                    {session.places_remaining} / {session.room_capacity}
                  </td>
                  <td>{statusBadge(session.status)}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    No upcoming sessions in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
