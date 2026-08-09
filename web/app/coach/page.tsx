"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

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

export default function CoachDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        <p>Loading…</p>
      </main>
    );
  if (error)
    return (
      <main>
        <p>{error}</p>
      </main>
    );

  return (
    <main>
      <h1>My sessions</h1>
      <p>
        Credit balance: <strong>{me?.credits}</strong>
      </p>

      <table>
        <thead>
          <tr>
            <th>Discipline</th>
            <th>Type</th>
            <th>When</th>
            <th>Room</th>
            <th>Status</th>
            <th>Attendees</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.discipline}</td>
              <td>{s.session_type}</td>
              <td>{new Date(s.starts_at).toLocaleString()}</td>
              <td>{s.room_name}</td>
              <td>{s.status}</td>
              <td>
                {s.attendees
                  .filter((a) => a.status === "active")
                  .map((a) => a.full_name)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Other coaches' busy periods</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          {busy.map((b) => (
            <tr key={b.id}>
              <td>{new Date(b.starts_at).toLocaleString()}</td>
              <td>{b.room_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
