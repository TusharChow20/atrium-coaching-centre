"use client";

import { useState } from "react";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

type Turn = { role: "user" | "assistant"; text: string };

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const message = input;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setLoading(true);

    const res = await fetch(`${apiBaseUrl}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });
    const body = await res.json();
    setLoading(false);
    setTurns((t) => [
      ...t,
      { role: "assistant", text: body.reply || body.error || "No response." },
    ]);
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Ask Atrium</h1>
      <div className="card mb-4 min-h-[300px] space-y-3">
        {turns.map((t, i) => (
          <div
            key={i}
            className={t.role === "user" ? "text-right" : "text-left"}
          >
            <span
              className={`inline-block rounded-lg px-3 py-2 text-sm ${
                t.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {t.text}
            </span>
          </div>
        ))}
        {turns.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask about sessions, your bookings, or your credit balance.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. what fitness sessions are on this week?"
        />
        <button className="btn" onClick={send} disabled={loading}>
          {loading ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}
