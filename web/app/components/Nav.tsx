"use client";

import { useState } from "react";
import NavAuth from "./NavAuth";
import { useMe, Me } from "./useMe";

function buildLinks(kind: Me["kind"] | undefined) {
  const base = [
    { href: "/", label: "Sessions" },
    { href: "/assistant", label: "Ask Atrium" },
  ];
  if (kind === "admin") {
    return [
      ...base,
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/sessions", label: "Manage sessions" },
      { href: "/admin/people", label: "People" },
      { href: "/calendar", label: "Calendar" },
    ];
  }
  if (kind === "coach") {
    return [
      ...base,
      { href: "/coach", label: "My sessions" },
      { href: "/calendar", label: "Calendar" },
    ];
  }
  if (kind === "participant") {
    return [
      ...base,
      { href: "/participant", label: "My bookings" },
      { href: "/calendar", label: "Calendar" },
    ];
  }
  return base;
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const { me } = useMe();
  const links = buildLinks(me?.kind);

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" className="text-lg font-semibold text-brand-700">
          Atrium
        </a>

        <div className="hidden items-center gap-1 text-sm md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 hover:bg-gray-100"
            >
              {l.label}
            </a>
          ))}
          <div className="ml-2">
            <NavAuth />
          </div>
        </div>

        <button
          className="rounded-md p-2 hover:bg-gray-100 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-200 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1 text-sm">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2">
              <NavAuth />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
