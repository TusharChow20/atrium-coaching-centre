"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import WeekCalendar, {
  CalendarEvent,
  startOfWeek,
} from "../components/WeekCalendar";
import RequireRole from "../components/RequireRole";
import { formatCentreDateTime } from "../lib/formatCentreTime";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const CENTRE_TIMEZONE =
  process.env.NEXT_PUBLIC_CENTRE_TIMEZONE || "America/New_York";

const disciplines = [
  "fitness",
  "lifestyle",
  "financial",
  "nutrition",
  "career",
  "mindfulness",
];
const sessionTypes = ["short", "standard", "intensive"];
const PAGE_SIZE = 8;

type Me = { id: number; full_name: string; credits: number };
type Room = { id: number; name: string; capacity: number };
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [page, setPage] = useState(1);

  // booking form state
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [discipline, setDiscipline] = useState(disciplines[0]);
  const [sessionType, setSessionType] = useState(sessionTypes[1]);
  const [roomId, setRoomId] = useState("");
  const [bookError, setBookError] = useState("");

  // reschedule state: which session id is being edited, and its draft date/time
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");

  function loadSessions() {
    fetch(`${apiBaseUrl}/api/sessions/mine`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setPage(1);
      });
  }

  function loadAll() {
    setLoading(true);
    Promise.all([
      fetch(`${apiBaseUrl}/api/me`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/sessions/mine`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/sessions/busy`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/api/rooms`, { credentials: "include" }),
    ])
      .then(async ([meRes, mineRes, busyRes, roomsRes]) => {
        if (!meRes.ok || !mineRes.ok || !busyRes.ok || !roomsRes.ok)
          throw new Error("not signed in");
        setMe(await meRes.json());
        setSessions(await mineRes.json());
        setBusy(await busyRes.json());
        setRooms(await roomsRes.json());
      })
      .catch(() => setError("Please log in as a coach to see this page."))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, []);

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
    loadSessions();
  }

  async function bookSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookError("");
    if (!date || !startTime || !roomId) {
      setBookError("Date, start time and room are all required");
      return;
    }
    const startsAt = DateTime.fromFormat(
      `${date} ${startTime}`,
      "yyyy-MM-dd HH:mm",
      { zone: CENTRE_TIMEZONE },
    )
      .toUTC()
      .toISO();

    const res = await fetch(`${apiBaseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: Number(roomId),
        discipline,
        session_type: sessionType,
        starts_at: startsAt,
        // no coach_id — the API forces it to the signed-in coach
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBookError(body.error || "Could not book that room");
      return;
    }
    setDate("");
    setStartTime("");
    setRoomId("");
    loadAll();
  }

  function startReschedule(s: MySession) {
    const start = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(
      CENTRE_TIMEZONE,
    );
    setReschedulingId(s.id);
    setRescheduleDate(start.toFormat("yyyy-MM-dd"));
    setRescheduleTime(start.toFormat("HH:mm"));
    setRescheduleError("");
  }

  async function saveReschedule(id: number) {
    setRescheduleError("");
    const startsAt = DateTime.fromFormat(
      `${rescheduleDate} ${rescheduleTime}`,
      "yyyy-MM-dd HH:mm",
      { zone: CENTRE_TIMEZONE },
    )
      .toUTC()
      .toISO();

    const res = await fetch(`${apiBaseUrl}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ starts_at: startsAt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRescheduleError(body.error || "Could not reschedule the session");
      return;
    }
    setReschedulingId(null);
    loadSessions();
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

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const pageItems = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My sessions</h1>
        <p className="mt-1 text-gray-600">
          Credit balance:{" "}
          <strong className="text-gray-900">{me?.credits}</strong>
        </p>
      </div>

      <section className="card max-w-xl">
        <h2 className="mb-4 text-lg font-semibold">Book a room</h2>
        <p className="mb-3 text-sm text-gray-500">
          Must be at least 48 hours before the session starts. The room fee is
          charged from your credit balance.
        </p>
        <form onSubmit={bookSession} className="grid grid-cols-2 gap-4">
          {bookError && <p className="col-span-2 text-red-600">{bookError}</p>}
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Starts</label>
            <input
              className="input"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Discipline</label>
            <select
              className="input"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              {disciplines.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
            >
              {sessionTypes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Room</label>
            <select
              className="input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value=""></option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (capacity {r.capacity})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="btn">
              Book room
            </button>
          </div>
        </form>
      </section>

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
              {pageItems.map((s) => (
                <tr key={s.id}>
                  <td className="capitalize">{s.discipline}</td>
                  <td className="capitalize">{s.session_type}</td>
                  <td>
                    {reschedulingId === s.id ? (
                      <div className="flex flex-col gap-1">
                        {rescheduleError && (
                          <p className="text-xs text-red-600">
                            {rescheduleError}
                          </p>
                        )}
                        <input
                          className="input"
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                        />
                        <input
                          className="input"
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn"
                            onClick={() => saveReschedule(s.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setReschedulingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      formatCentreDateTime(s.starts_at)
                    )}
                  </td>
                  <td>{s.room_name}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>
                    {s.attendees
                      .filter((a) => a.status === "active")
                      .map((a) => a.full_name)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {s.status === "scheduled" && reschedulingId !== s.id && (
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => startReschedule(s)}
                        >
                          Reschedule
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => cancelSession(s.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    No sessions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sessions.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, sessions.length)} of {sessions.length}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <button
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
