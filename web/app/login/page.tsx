"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

const dashboardByRole: Record<string, string> = {
  admin: "/admin",
  coach: "/coach",
  participant: "/participant",
};

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(`${apiBaseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not sign in");
      return;
    }

    const person = await res.json();
    router.push(dashboardByRole[person.kind] || "/");
  }

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn w-full" disabled={loading}>
          {loading ? "Signing in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
