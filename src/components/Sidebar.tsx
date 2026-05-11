"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const REACH_OUT_LINKS = [
  { href: "/today", label: "Today", glyph: "◐", badge: 4 },
  { href: "/", label: "Compose", glyph: "↗" },
  { href: "/people", label: "People", glyph: "◇" },
  { href: "/settings", label: "Settings", glyph: "✦" },
];

const INCOMING = [
  { label: "Resume", glyph: "§" },
  { label: "Opportunities", glyph: "◇" },
  { label: "Inbox triage", glyph: "✉" },
  { label: "Calendar", glyph: "▢" },
  { label: "Research", glyph: "◎" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-64 shrink-0 border-r border-[color:var(--color-line)]/60 bg-[color:var(--color-cream)] flex flex-col">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-clay)] text-white text-lg font-medium">
            c
          </span>
          <span className="leading-tight">
            <div className="text-base font-semibold text-[color:var(--color-ink)]">Crew</div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-muted)]">
              Sam · Beta
            </div>
          </span>
        </Link>
      </div>

      <div className="px-3">
        <Link
          href="/"
          className="block rounded-md bg-[color:var(--color-clay)]/20 px-3 py-3 hover:bg-[color:var(--color-clay)]/30"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[color:var(--color-clay-dark)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-clay)] animate-pulse" />
            Live Agent
          </div>
          <div className="mt-0.5 text-[color:var(--color-ink)] font-semibold">Reach Out</div>
        </Link>
      </div>

      <nav className="mt-3 px-3 space-y-0.5 text-sm">
        {REACH_OUT_LINKS.map((l) => {
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 transition-colors ${
                active
                  ? "bg-[color:var(--color-cream-50)] text-[color:var(--color-ink)] row-active"
                  : "text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-50)]/60"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="text-[color:var(--color-clay)] w-3 inline-flex justify-center">
                  {l.glyph}
                </span>
                {l.label}
              </span>
              {l.badge ? (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[color:var(--color-clay)]/30 px-1.5 py-0.5 text-[10px] text-[color:var(--color-clay-dark)]">
                  {l.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 px-5 text-[10px] uppercase tracking-wider text-[color:var(--color-ink-muted)]">
        Incoming · {INCOMING.length}
      </div>
      <ul className="mt-2 px-3 space-y-0.5 text-sm">
        {INCOMING.map((i) => (
          <li
            key={i.label}
            className="flex items-center justify-between rounded-md px-3 py-2 text-[color:var(--color-ink-muted)]"
          >
            <span className="flex items-center gap-3">
              <span className="text-[color:var(--color-ink-muted)]/60 w-3 inline-flex justify-center">
                {i.glyph}
              </span>
              {i.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-muted)]/70">
              soon
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto px-5 py-4 text-[11px] text-[color:var(--color-ink-muted)]">
        crew.app
      </div>
    </aside>
  );
}
