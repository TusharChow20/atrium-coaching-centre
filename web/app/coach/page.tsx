"use client";

import { useEffect, useState } from "react";
import WeekCalendar, {
  CalendarEvent,
  startOfWeek,
} from "../components/WeekCalendar";
import RequireRole from "../components/RequireRole";
import { formatCentreDateTime } from "../lib/formatCentreTime";
const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Me = { id: number; full_name: string; credits: number };
type MySession = {
  id: number;
  discipline: string;
  session_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  attendees: { id: number; status: string; full_name: string; email: string }[];
};
type BusySlot = {
  id: number;
  starts_at: string;
  ends_at: string;
  room_name: string;
};

function statusBadge(status: string) {
  const cls =
    status === "scheduled"
      ? "badge-scheduled"
      : status === "cancelled"
        ? "badge-cancelled"
        : "badge-completed";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function CoachDashboard() {
  return (
    <RequireRole allow={["coach"]}>{() => <CoachDashboardInner />}</RequireRole>
  );
}
function CoachDashboardInner() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  async function cancelSession(id: number) {
    if (
      !confirm(
        "Cancel this session? All participants will be refunded in full.",
      )
    )
      return;
    const res = await fetch(`${apiBaseUrl}/api/sessions/${id}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Could not cancel the session");
      return;
    }
    // reload sessions after cancelling
    fetch(`${apiBaseUrl}/api/sessions/mine`, { credentials: "include" })
      .then((r) => r.json())
      .then(setSessions);
  }

  useEffect(() => {
    Promise.all([
      fetch(`${apiBaseUrl}/api/me`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/sessions/mine`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/sessions/busy`, { credentials: "include" }),
    ])
      .then(async ([meRes, mineRes, busyRes]) => {
        if (!meRes.ok || !mineRes.ok || !busyRes.ok)
          throw new Error("not signed in");
        setMe(await meRes.json());
        setSessions(await mineRes.json());
        setBusy(await busyRes.json());
      })
      .catch(() => setError("Please log in as a coach to see this page."))
      .finally(() => setLoading(false));
  }, []);

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

  const calendarEvents: CalendarEvent[] = [
    ...sessions
      .filter((s) => s.status === "scheduled")
      .map((s) => ({
        id: s.id,
        starts_at: s.starts_at,
        label: `${s.discipline} · ${s.room_name}`,
        detail: `${s.attendees.filter((a) => a.status === "active").length} attending`,
        variant: "own" as const,
      })),
    ...busy.map((b) => ({
      id: 100000 + b.id,
      starts_at: b.starts_at,
      label: "Busy",
      detail: b.room_name,
      variant: "busy" as const,
    })),
  ];

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My sessions</h1>
        <p className="mt-1 text-gray-600">
          Credit balance:{" "}
          <strong className="text-gray-900">{me?.credits}</strong>
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Calendar</h2>
        <p className="mb-3 text-sm text-gray-500">
          Your own sessions show full detail. Other coaches' sessions show only
          as busy — no discipline, no attendee names.
        </p>
        <WeekCalendar
          events={calendarEvents}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Session detail</h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Type</th>
                <th>When</th>
                <th>Room</th>
                <th>Status</th>
                <th>Attendees</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="capitalize">{s.discipline}</td>
                  <td className="capitalize">{s.session_type}</td>
                  <td>{formatCentreDateTime(s.starts_at)}</td>
                  <td>{s.room_name}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>
                    {s.attendees
                      .filter((a) => a.status === "active")
                      .map((a) => a.full_name)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {s.status === "scheduled" && (
                      <button
                        className="btn-secondary"
                        onClick={() => cancelSession(s.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No sessions yet.
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
