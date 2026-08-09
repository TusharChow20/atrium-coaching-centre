"use client";

import { useEffect, useState } from "react";

type Room = { id: number; name: string; capacity: number };
type Person = { id: number; full_name: string; email: string; kind: string };
type Session = { id: number; starts_at: string; ends_at: string };

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export default function AdminDashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const from = startOfWeek(new Date());
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

    fetch(`${apiBaseUrl}/api/rooms`, { credentials: "include" })
      .then((r) => r.json())
      .then(setRooms);
    fetch(`${apiBaseUrl}/api/people`, { credentials: "include" })
      .then((r) => r.json())
      .then(setPeople);
    fetch(
      `${apiBaseUrl}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
      {
        credentials: "include",
      },
    )
      .then((r) => r.json())
      .then(setSessions);
  }, []);

  const cards = [
    { label: "Rooms", value: rooms.length },
    { label: "Sessions this week", value: sessions.length },
    { label: "People", value: people.length },
  ];

  return (
    <main>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <a href="/admin/sessions" className="btn mt-6 inline-block">
        Open session calendar
      </a>
    </main>
  );
}
