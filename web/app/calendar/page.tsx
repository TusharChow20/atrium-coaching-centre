"use client";

import { useEffect, useState } from "react";
import RequireRole from "../components/RequireRole";
import { Me } from "../components/useMe";
import WeekCalendar, {
  CalendarEvent,
  startOfWeek,
} from "../components/WeekCalendar";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function CalendarPage() {
  return (
    <RequireRole allow={["admin", "coach", "participant"]}>
      {(me) => <CalendarInner kind={me.kind} />}
    </RequireRole>
  );
}

function CalendarInner({ kind }: { kind: Me["kind"] }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, weekStart]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (kind === "coach") {
        const [mineRes, busyRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/sessions/mine`, { credentials: "include" }),
          fetch(`${apiBaseUrl}/api/sessions/busy`, { credentials: "include" }),
        ]);
        if (!mineRes.ok || !busyRes.ok) throw new Error();
        const mine = await mineRes.json();
        const busy = await busyRes.json();
        setEvents([
          ...mine
            .filter((s: any) => s.status === "scheduled")
            .map((s: any) => ({
              id: s.id,
              starts_at: s.starts_at,
              label: `${s.discipline} · ${s.room_name}`,
              detail: `${s.attendees.filter((a: any) => a.status === "active").length} attending`,
              variant: "own" as const,
            })),
          ...busy.map((b: any) => ({
            id: 100000 + b.id,
            starts_at: b.starts_at,
            label: "Busy",
            detail: b.room_name,
            variant: "busy" as const,
          })),
        ]);
      } else if (kind === "participant") {
        const res = await fetch(`${apiBaseUrl}/api/enrolments/mine`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const bookings = await res.json();
        setEvents(
          bookings
            .filter((b: any) => b.status === "active")
            .map((b: any) => ({
              id: b.id,
              starts_at: b.starts_at,
              label: `${b.discipline} · ${b.room_name}`,
              detail: b.session_type,
              variant: "own" as const,
            })),
        );
      } else {
        const to = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const res = await fetch(
          `${apiBaseUrl}/api/sessions?from=${weekStart.toISOString()}&to=${to.toISOString()}`,
        );
        if (!res.ok) throw new Error();
        const sessions = await res.json();
        setEvents(
          sessions.map((s: any) => ({
            id: s.id,
            starts_at: s.starts_at,
            label: `${s.discipline} · ${s.room_name}`,
            detail: `${s.coach_name} · ${s.enrolled_count}/${s.room_capacity}`,
            variant: "own" as const,
          })),
        );
      }
    } catch {
      setError("Could not load the calendar. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Calendar</h1>
      {kind === "coach" && (
        <p className="text-sm text-gray-500">
          Your own sessions show full detail. Other coaches' sessions show only
          as busy — no discipline, no attendee names.
        </p>
      )}
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <WeekCalendar
          events={events}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />
      )}
    </main>
  );
}
