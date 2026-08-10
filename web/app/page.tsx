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

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const sessionTypeInfo = [
  {
    type: "Short",
    duration: "45 minutes",
    roomHeld: "45 minutes",
    roomFee: 30,
    seatFee: 15,
    note: null as string | null,
  },
  {
    type: "Standard",
    duration: "60 minutes",
    roomHeld: "60 minutes",
    roomFee: 40,
    seatFee: 20,
    note: null,
  },
  {
    type: "Intensive",
    duration: "3 hours of teaching",
    roomHeld: "3 hours 30 minutes",
    roomFee: 120,
    seatFee: 60,
    note: "Includes a 30-minute lunch interval in the middle. The room stays booked through the break, and neither the coach nor any participant may be booked anywhere else during it.",
  },
];

const coachRefundTiers = [
  { notice: "96 hours or more before the session", percent: "100%" },
  { notice: "48 up to 96 hours before", percent: "50%" },
  { notice: "24 up to 48 hours before", percent: "25%" },
  { notice: "Under 24 hours before", percent: "Nothing" },
];

const participantRefundTiers = [
  { notice: "24 hours or more before the session", percent: "100%" },
  { notice: "12 up to 24 hours before", percent: "50%" },
  { notice: "4 up to 12 hours before", percent: "25%" },
  { notice: "Under 4 hours before", percent: "Nothing" },
];

export default async function PublicSessions() {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `${apiBaseUrl}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
    { cache: "no-store" },
  );
  const sessions: Session[] = await res.json();

  return (
    <main className="space-y-14">
      {/* Hero */}
      <section>
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-brand-600">
          Twelve rooms · open 07:00–21:00, Monday to Saturday · closed Sunday
        </p>
        <h1 className="max-w-2xl text-3xl font-bold text-gray-900 sm:text-4xl">
          Know exactly what a session costs and when you can get your money back
          — before you book it.
        </h1>
        <p className="mt-4 max-w-2xl text-gray-600">
          Atrium runs coaching sessions across twelve rooms. Coaches book a room
          to run a session; participants book a place in it. Everything on this
          page — fees, deadlines, and what you get back if you cancel — applies
          to every booking, and the rules below are the whole policy. There's
          nothing else to check.
        </p>
        <div className="mt-6 flex gap-3">
          <a href="/login" className="btn">
            Log in to book
          </a>
          <a href="#sessions" className="btn-secondary">
            See upcoming sessions
          </a>
        </div>
      </section>

      {/* Credits */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          Credits, not cash
        </h2>
        <p className="mt-2 max-w-2xl text-gray-600">
          Every booking is paid for in credits. Credits are always whole numbers
          — no fractions, no rounding you can't predict.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <div className="text-sm text-gray-500">
              New participant accounts start with
            </div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">
              4,000 credits
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">
              New coach accounts start with
            </div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">
              2,000 credits
            </div>
          </div>
        </div>
      </section>

      {/* Session types & fees */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          Session types and fees
        </h2>
        <p className="mt-2 max-w-2xl text-gray-600">
          A coach spends the room fee to book a room. Each participant spends
          the seat fee to book a place in it. Fees scale with how long the
          session runs.
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Type</th>
                <th>Teaching time</th>
                <th>Room held for</th>
                <th>Room fee (coach)</th>
                <th>Seat fee (participant)</th>
              </tr>
            </thead>
            <tbody>
              {sessionTypeInfo.map((row) => (
                <tr key={row.type}>
                  <td className="font-medium text-gray-900">{row.type}</td>
                  <td>{row.duration}</td>
                  <td>{row.roomHeld}</td>
                  <td>{row.roomFee} credits</td>
                  <td>{row.seatFee} credits</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sessionTypeInfo
          .filter((r) => r.note)
          .map((r) => (
            <p key={r.type} className="mt-3 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{r.type}:</span>{" "}
              {r.note}
            </p>
          ))}
        <p className="mt-3 text-sm text-gray-500">
          A room's capacity counts participants only — the coach doesn't take up
          one of the places.
        </p>
      </section>

      {/* Booking deadlines */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          Booking deadlines
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="font-medium text-gray-900">Coaches</h3>
            <p className="mt-2 text-sm text-gray-600">
              A room must be booked at least <strong>48 hours</strong> before
              the session starts. There's no way to book a room any closer to
              the start time than that.
            </p>
          </div>
          <div className="card">
            <h3 className="font-medium text-gray-900">Participants</h3>
            <p className="mt-2 text-sm text-gray-600">
              You can book a place any time up until the session starts, as long
              as a place remains. There's no advance-notice requirement on this
              side — just availability.
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          Every session has to fit entirely inside opening hours (07:00–21:00
          centre time) on a day we're open. A session can't be booked to run
          past close, and nothing runs on Sundays.
        </p>
      </section>

      {/* Cancellation policy */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          If you need to cancel
        </h2>
        <p className="mt-2 max-w-2xl text-gray-600">
          Refunds are based on how much notice you give, measured in hours from
          when you cancel to when the session was due to start. Refund
          percentages are applied to the fee you originally paid and always
          round down to the nearest whole credit — so a 25% refund on a
          15-credit fee is 3 credits, not 4. That means we never refund more
          than we collected.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="font-medium text-gray-900">
              A coach cancels a room
            </h3>
            <table className="table-base mt-3">
              <thead>
                <tr>
                  <th>Notice given</th>
                  <th>Room fee refunded</th>
                </tr>
              </thead>
              <tbody>
                {coachRefundTiers.map((t) => (
                  <tr key={t.notice}>
                    <td>{t.notice}</td>
                    <td>{t.percent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="font-medium text-gray-900">
              A participant cancels a place
            </h3>
            <table className="table-base mt-3">
              <thead>
                <tr>
                  <th>Notice given</th>
                  <th>Seat fee refunded</th>
                </tr>
              </thead>
              <tbody>
                {participantRefundTiers.map((t) => (
                  <tr key={t.notice}>
                    <td>{t.notice}</td>
                    <td>{t.percent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-gray-500">
              These windows are tighter than a coach's because cancelling one
              seat is easy for us to fill — cancelling a room affects everyone
              booked into it. A participant can also book right up to the last
              minute, so the refund clock has to move faster to mean anything.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-5">
          <h3 className="font-medium text-brand-700">
            If your coach cancels the session
          </h3>
          <p className="mt-2 text-sm text-brand-700">
            You get a full refund of your seat fee, regardless of how much
            notice was given. You didn't cancel — the coach did — so none of the
            tiers above apply to you.
          </p>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          One more thing worth knowing: a coach can't book a place in their own
          session, and nobody — coach or participant — can hold two overlapping
          commitments at once, whether that's teaching one session and attending
          another, or two sessions that overlap in time.
        </p>
      </section>

      {/* Sessions list */}
      <section id="sessions">
        <h2 className="text-xl font-semibold text-gray-900">
          Upcoming sessions
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          The next two weeks. Log in to book a place or a room.
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Type</th>
                <th>Date</th>
                <th>Time</th>
                <th>Room</th>
                <th>Places remaining</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="capitalize">{session.discipline}</td>
                  <td className="capitalize">{session.session_type}</td>
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
                  <td>{session.room_name}</td>
                  <td>
                    {session.places_remaining > 0
                      ? session.places_remaining
                      : "Full"}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Nothing scheduled in the next two weeks.
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
