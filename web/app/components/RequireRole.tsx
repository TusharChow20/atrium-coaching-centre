"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe, Me } from "./useMe";

const dashboardByRole: Record<string, string> = {
  admin: "/admin",
  coach: "/coach",
  participant: "/participant",
};

export default function RequireRole({
  allow,
  children,
}: {
  allow: Array<Me["kind"]>;
  children: (me: Me) => React.ReactNode;
}) {
  const { me, loading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!allow.includes(me.kind)) {
      router.replace(dashboardByRole[me.kind] || "/login");
    }
  }, [loading, me, allow, router]);

  if (loading)
    return (
      <main>
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  if (!me || !allow.includes(me.kind))
    return (
      <main>
        <p className="text-gray-500">Redirecting…</p>
      </main>
    );

  return <>{children(me)}</>;
}
