"use client";

import { useEffect, useState } from "react";
import RequireRole from "../../components/RequireRole";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Person = {
  id: number;
  email: string;
  full_name: string;
  kind: string;
  credits: number;
  active: boolean;
};

const kinds = ["all", "admin", "coach", "participant"] as const;

export default function AdminPeoplePage() {
  return (
    <RequireRole allow={["admin"]}>{() => <AdminPeopleInner />}</RequireRole>
  );
}

function AdminPeopleInner() {
  const [people, setPeople] = useState<Person[]>([]);
  const [kind, setKind] = useState<(typeof kinds)[number]>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = kind === "all" ? "" : `?kind=${kind}`;
    fetch(`${apiBaseUrl}/api/people${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setPeople)
      .finally(() => setLoading(false));
  }, [kind]);

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">People</h1>

      <div className="flex gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            className={k === kind ? "btn" : "btn-secondary"}
            onClick={() => setKind(k)}
          >
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Credits</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td>{p.email}</td>
                <td className="capitalize">{p.kind}</td>
                <td>{p.credits}</td>
                <td>
                  <span
                    className={`badge ${p.active ? "badge-active" : "badge-cancelled"}`}
                  >
                    {p.active ? "active" : "inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && people.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  No people found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
