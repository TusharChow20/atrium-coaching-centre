"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import RequireRole from "../../../components/RequireRole";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const CENTRE_TIMEZONE =
  process.env.NEXT_PUBLIC_CENTRE_TIMEZONE || "America/New_York";

type Attendee = {
  id: number;
  status: string;
  credits_charged: number;
  credits_refunded: number;
  enrolled_at: string;
  cancelled_at: string | null;
  person_id: number;
  full_name: string;
  email: string;
};

type SessionDetail = {
  id: number;
  discipline: string;
  session_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  room_fee_credits: number;
  seat_fee_credits: number;
  room: { id: number; name: string; capacity: number } | null;
  coach: { id: number; full_name: string } | null;
  attendees: Attendee[];
};

function statusBadge(status: string) {
  const cls =
    status === "scheduled"
      ? "badge-scheduled"
      : status === "cancelled"
        ? "badge-cancelled"
        : status === "completed"
          ? "badge-completed"
          : "badge-active";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function AdminSessionDetailPage() {
  return (
    <RequireRole allow={["admin"]}>
      {() => <AdminSessionDetailInner />}
    </RequireRole>
  );
}

function AdminSessionDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  function load() {
    setLoading(true);
    fetch(`${apiBaseUrl}/api/sessions/${id}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setSession(data);
        const start = DateTime.fromISO(data.starts_at, {
          zone: "utc",
        }).setZone(CENTRE_TIMEZONE);
        setDate(start.toFormat("yyyy-MM-dd"));
        setTime(start.toFormat("HH:mm"));
      })
      .catch(() => setError("Could not load this session."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function cancelSession() {
    if (
      !confirm(
        "Cancel this session? All active participants will be refunded in full and notified.",
      )
    )
      return;
    setActionError("");
    const res = await fetch(`${apiBaseUrl}/api/sessions/${id}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error || "Could not cancel the session");
      return;
    }
    load();
  }

  async function reschedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    const startsAt = DateTime.fromFormat(
      `${date} ${time}`,
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
      setActionError(body.error || "Could not reschedule the session");
      return;
    }
    load();
  }

  if (loading)
    return (
      <main>
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  if (error || !session)
    return (
      <main>
        <p className="text-red-600">{error || "Session not found."}</p>
      </main>
    );

  const activeAttendees = session.attendees.filter(
    (a) => a.status === "active",
  );

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <button
            className="mb-2 text-sm text-brand-600 hover:underline"
            onClick={() => router.push("/admin/sessions")}
          >
            ← Back to calendar
          </button>
          <h1 className="text-2xl font-bold capitalize">
            {session.discipline} · {session.session_type}
          </h1>
          <p className="mt-1 text-gray-600">
            {new Date(session.starts_at).toLocaleString()} –{" "}
            {new Date(session.ends_at).toLocaleTimeString()} ·{" "}
            {session.room?.name ?? "—"} · Coach:{" "}
            {session.coach?.full_name ?? "—"}
          </p>
        </div>
        {statusBadge(session.status)}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-sm text-gray-500">Room fee (coach)</div>
          <div className="mt-1 text-2xl font-semibold">
            {session.room_fee_credits} credits
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Seat fee (participant)</div>
          <div className="mt-1 text-2xl font-semibold">
            {session.seat_fee_credits} credits
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Active attendees</div>
          <div className="mt-1 text-2xl font-semibold">
            {activeAttendees.length} / {session.room?.capacity ?? "—"}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Attendees</h2>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Charged</th>
                <th>Refunded</th>
                <th>Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {session.attendees.map((a) => (
                <tr key={a.id}>
                  <td>{a.full_name}</td>
                  <td>{a.email}</td>
                  <td>{statusBadge(a.status)}</td>
                  <td>{a.credits_charged}</td>
                  <td>{a.credits_refunded}</td>
                  <td>{new Date(a.enrolled_at).toLocaleString()}</td>
                </tr>
              ))}
              {session.attendees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Nobody has booked a place yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {session.status === "scheduled" && (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="card">
            <h2 className="mb-2 text-lg font-semibold">Reschedule</h2>
            <form onSubmit={reschedule} className="space-y-3">
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
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              <button type="submit" className="btn">
                Save new time
              </button>
            </form>
          </div>
          <div className="card">
            <h2 className="mb-2 text-lg font-semibold">Cancel session</h2>
            <p className="mb-3 text-sm text-gray-600">
              All active participants are refunded in full and notified, the
              coach's room fee is refunded per the notice-given tiers, and the
              admin is notified.
            </p>
            <button className="btn-secondary" onClick={cancelSession}>
              Cancel this session
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
