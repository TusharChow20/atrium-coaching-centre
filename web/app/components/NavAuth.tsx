"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Me = { id: number; full_name: string; kind: string };

export default function NavAuth() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch(`${apiBaseUrl}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
    setMe(null);
    router.push("/login");
    router.refresh();
  }

  if (loading) return <div className="w-20" />;

  if (!me) {
    return (
      <a href="/login" className="btn">
        Log in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">
        {me.full_name}{" "}
        <span className="capitalize text-gray-400">({me.kind})</span>
      </span>
      <button onClick={logout} className="btn-secondary">
        Log out
      </button>
    </div>
  );
}
