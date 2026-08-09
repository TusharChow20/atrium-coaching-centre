// web/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import NavAuth from "./components/NavAuth";

export const metadata: Metadata = {
  title: "Atrium Coaching Centre",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-semibold text-brand-700">
              Atrium
            </a>
            <div className="flex items-center gap-1 text-sm">
              <a href="/" className="rounded-md px-3 py-2 hover:bg-gray-100">
                Sessions
              </a>
              <a
                href="/admin"
                className="rounded-md px-3 py-2 hover:bg-gray-100"
              >
                Dashboard
              </a>
              <a
                href="/admin/sessions"
                className="rounded-md px-3 py-2 hover:bg-gray-100"
              >
                Calendar
              </a>
              <a
                href="/coach"
                className="rounded-md px-3 py-2 hover:bg-gray-100"
              >
                Coach
              </a>
              <a
                href="/participant"
                className="rounded-md px-3 py-2 hover:bg-gray-100"
              >
                Participant
              </a>
              <div className="ml-2">
                <NavAuth />
              </div>
            </div>
          </div>
        </nav>
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
