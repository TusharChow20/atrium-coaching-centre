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
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  if (error)
    return (
      <main>
        <p className="text-red-600">{error}</p>
      </main>
    );

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My sessions</h1>
        <p className="mt-1 text-gray-600">
          Credit balance:{" "}
          <strong className="text-gray-900">{me?.credits}</strong>
        </p>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="capitalize">{s.discipline}</td>
                <td className="capitalize">{s.session_type}</td>
                <td>{new Date(s.starts_at).toLocaleString()}</td>
                <td>{s.room_name}</td>
                <td>{statusBadge(s.status)}</td>
                <td>
                  {s.attendees
                    .filter((a) => a.status === "active")
                    .map((a) => a.full_name)
                    .join(", ") || "—"}
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

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Other coaches' busy periods
        </h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
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
              {busy.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-gray-500">
                    Nothing scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
