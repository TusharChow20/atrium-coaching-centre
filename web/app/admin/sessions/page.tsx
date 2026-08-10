"use client";

import { DateTime } from "luxon";
import { useEffect, useState } from "react";

type Room = { id: number; name: string; capacity: number };
type Person = { id: number; full_name: string; email: string; kind: string };
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

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const disciplines = [
  "fitness",
  "lifestyle",
  "financial",
  "nutrition",
  "career",
  "mindfulness",
];
const CENTRE_TIMEZONE =
  process.env.NEXT_PUBLIC_CENTRE_TIMEZONE || "America/New_York";
const sessionTypes = ["short", "standard", "intensive"];
const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const dayMs = 24 * 60 * 60 * 1000;

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export default function AdminSessions() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [discipline, setDiscipline] = useState(disciplines[0]);
  const [sessionType, setSessionType] = useState(sessionTypes[1]);
  const [roomId, setRoomId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [error, setError] = useState("");
  const days = [0, 1, 2, 3, 4, 5, 6].map(
    (offset) => new Date(weekStart.getTime() + offset * dayMs),
  );

  function loadSessions() {
    const to = new Date(weekStart.getTime() + 7 * dayMs);
    fetch(
      `${apiBaseUrl}/api/sessions?from=${weekStart.toISOString()}&to=${to.toISOString()}`,
      {
        credentials: "include",
      },
    )
      .then((res) => res.json())
      .then(setSessions);
  }

  useEffect(() => {
    loadSessions();
  }, [weekStart]);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/rooms`, { credentials: "include" })
      .then((r) => r.json())
      .then(setRooms);
    fetch(`${apiBaseUrl}/api/people?kind=coach`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople);
  }, []);

  function sessionsFor(day: Date, hour: number) {
    return sessions.filter((s) => {
      const starts = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(
        CENTRE_TIMEZONE,
      );
      return (
        starts.year === day.getFullYear() &&
        starts.month === day.getMonth() + 1 &&
        starts.day === day.getDate() &&
        starts.hour === hour
      );
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const res = await fetch(`${apiBaseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: Number(roomId),
        coach_id: Number(coachId),
        discipline,
        session_type: sessionType,
        starts_at: DateTime.fromFormat(
          `${date} ${startTime}`,
          "yyyy-MM-dd HH:mm",
          { zone: CENTRE_TIMEZONE },
        )
          .toUTC()
          .toISO(),
        ends_at: DateTime.fromFormat(`${date} ${endTime}`, "yyyy-MM-dd HH:mm", {
          zone: CENTRE_TIMEZONE,
        })
          .toUTC()
          .toISO(),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not create the session");
      return;
    }
    loadSessions();
  }

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Session calendar</h1>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() =>
              setWeekStart(new Date(weekStart.getTime() - 7 * dayMs))
            }
          >
            ← Previous week
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              setWeekStart(new Date(weekStart.getTime() + 7 * dayMs))
            }
          >
            Next week →
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="w-16 border-b border-gray-200 bg-gray-50 p-2"></th>
              {days.map((day, i) => (
                <th
                  key={i}
                  className="min-w-[130px] border-b border-gray-200 bg-gray-50 p-2 text-left font-medium"
                >
                  {dayNames[i]} {day.getDate()}/{day.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour}>
                <th className="border-b border-gray-100 bg-gray-50 p-2 text-left font-normal text-gray-500">
                  {hour}:00
                </th>
                {days.map((day, i) => (
                  <td
                    key={i}
                    className="h-12 border-b border-l border-gray-100 p-1 align-top"
                  >
                    {sessionsFor(day, hour).map((s) => (
                      <div
                        key={s.id}
                        className="mb-1 truncate rounded bg-brand-50 px-1.5 py-0.5 text-brand-700"
                      >
                        {s.discipline} · {s.room_name} ({s.enrolled_count}/
                        {s.room_capacity})
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card max-w-xl">
        <h2 className="mb-4 text-lg font-semibold">Create a session</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          {error && <p className="text-red-600">{error}</p>}
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div />
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
            <label className="label">Ends</label>
            <input
              className="input"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
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
          <div>
            <label className="label">Room</label>
            <select
              className="input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value=""></option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Coach</label>
            <select
              className="input"
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
            >
              <option value=""></option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="btn">
              Create session
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
