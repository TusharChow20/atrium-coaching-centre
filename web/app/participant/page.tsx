"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

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

export default function ParticipantDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <h1>My bookings</h1>
      <p>
        Credit balance: <strong>{me?.credits}</strong>
      </p>

      {bookings.length === 0 && <p>No bookings yet.</p>}

      <table>
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
              <td>{b.discipline}</td>
              <td>{b.session_type}</td>
              <td>{new Date(b.starts_at).toLocaleString()}</td>
              <td>{b.room_name}</td>
              <td>{b.status}</td>
              <td>
                {b.status === "active" && b.session_status === "scheduled" && (
                  <button onClick={() => cancelBooking(b.id)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
