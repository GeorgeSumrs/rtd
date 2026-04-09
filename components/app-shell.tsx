"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/progress", label: "Progress" },
  { href: "/summary", label: "Summary" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const isPublicPage =
    pathname === "/" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/reset-password";

  if (isPublicPage) {
    return children;
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-[color:rgba(246,242,235,.82)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <Link href="/dashboard" className="font-display text-lg font-semibold tracking-tight text-[var(--ink)]">
              RTD Tracker
            </Link>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/dashboard" className="btn btn-secondary">
              Dashboard
            </Link>
            <Link href="/calendar" className="btn btn-secondary">
              Calendar
            </Link>
            <Link href="/settings" className="btn btn-secondary">
              Settings
            </Link>
            <Link href="/log" className="btn btn-accent">
              Open Log
            </Link>
            {session?.user ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await authClient.signOut();
                  window.location.href = "/sign-in";
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-5 py-8 pb-28 sm:px-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[color:rgba(246,242,235,.95)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-2xl justify-around px-2 py-3">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
