"use client";

import { useEffect, useState } from "react";
import WeekCalendar, {
  CalendarEvent,
  startOfWeek,
} from "../components/WeekCalendar";
import RequireRole from "../components/RequireRole";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Me = { id: number; full_name: string; credits: number; kind: string };
type Booking = {
  id: number;
  status: string;
  credits_charged: number;
  credits_refunded: number;
  session_id: number;
  discipline: string;
  session_type: string;
  session_status: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
};
type Browsable = {
  id: number;
  discipline: string;
  session_type: string;
  starts_at: string;
  room_name: string;
  room_capacity: number;
  coach_name: string;
  enrolled_count: number;
  places_remaining: number;
};
function statusBadge(status: string) {
  const cls = status === "active" ? "badge-active" : "badge-cancelled";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function ParticipantDashboard() {
  return (
    <RequireRole allow={["participant"]}>
      {() => <ParticipantDashboardInner />}
    </RequireRole>
  );
}
function ParticipantDashboardInner() {
  const [me, setMe] = useState<Me | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [browsable, setBrowsable] = useState<Browsable[]>([]);
  const [bookingError, setBookingError] = useState("");

  function loadBrowsable() {
    const from = new Date().toISOString();
    fetch(`${apiBaseUrl}/api/sessions?from=${from}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setBrowsable);
  }
  function load() {
    setLoading(true);
    Promise.all([
      fetch(`${apiBaseUrl}/api/me`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/enrolments/mine`, { credentials: "include" }),
    ])
      .then(async ([meRes, bookingsRes]) => {
        if (!meRes.ok || !bookingsRes.ok) throw new Error("not signed in");
        setMe(await meRes.json());
        setBookings(await bookingsRes.json());
      })
      .catch(() => setError("Please log in as a participant to see this page."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function bookSession(sessionId: number) {
    setBookingError("");
    const res = await fetch(
      `${apiBaseUrl}/api/enrolments/sessions/${sessionId}/enrol`,
      { method: "POST", credentials: "include" },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBookingError(body.error || "Could not book that session");
      return;
    }
    load(); // refresh my bookings
    loadBrowsable(); // refresh remaining places
  }
  async function cancelBooking(id: number) {
    await fetch(`${apiBaseUrl}/api/enrolments/${id}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    load();
  }

  if (loading)
    return (
      <main>
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  if (error)
    return (
      <main>
        <p className="text-red-600">{error}</p>
      </main>
    );

  const calendarEvents: CalendarEvent[] = bookings
    .filter((b) => b.status === "active")
    .map((b) => ({
      id: b.id,
      starts_at: b.starts_at,
      label: `${b.discipline} · ${b.room_name}`,
      detail: b.session_type,
      variant: "own" as const,
    }));

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My bookings</h1>
        <p className="mt-1 text-gray-600">
          Credit balance:{" "}
          <strong className="text-gray-900">{me?.credits}</strong>
        </p>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Book a session</h2>
        {bookingError && (
          <p className="mb-2 text-sm text-red-600">{bookingError}</p>
        )}
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Type</th>
                <th>When</th>
                <th>Room</th>
                <th>Coach</th>
                <th>Places left</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {browsable.map((s) => {
                const alreadyBooked = bookings.some(
                  (b) => b.session_id === s.id && b.status === "active",
                );
                return (
                  <tr key={s.id}>
                    <td className="capitalize">{s.discipline}</td>
                    <td className="capitalize">{s.session_type}</td>
                    <td>{new Date(s.starts_at).toLocaleString()}</td>
                    <td>{s.room_name}</td>
                    <td>{s.coach_name}</td>
                    <td>
                      {s.places_remaining > 0 ? s.places_remaining : "Full"}
                    </td>
                    <td>
                      {alreadyBooked ? (
                        <span className="text-sm text-gray-400">Booked</span>
                      ) : (
                        <button
                          className="btn"
                          disabled={s.places_remaining <= 0}
                          onClick={() => bookSession(s.id)}
                        >
                          Book
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {browsable.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    Nothing scheduled to book right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Calendar</h2>
        <WeekCalendar
          events={calendarEvents}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bookings</h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Type</th>
                <th>When</th>
                <th>Room</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="capitalize">{b.discipline}</td>
                  <td className="capitalize">{b.session_type}</td>
                  <td>{new Date(b.starts_at).toLocaleString()}</td>
                  <td>{b.room_name}</td>
                  <td>{statusBadge(b.status)}</td>
                  <td>
                    {b.status === "active" &&
                      b.session_status === "scheduled" && (
                        <button
                          className="btn-secondary"
                          onClick={() => cancelBooking(b.id)}
                        >
                          Cancel
                        </button>
                      )}
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No bookings yet.
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
