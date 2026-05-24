"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const REACH_OUT_LINKS = [
  { href: "/today", label: "Today", glyph: "◐" },
  { href: "/compose", label: "Compose", glyph: "↗" },
  { href: "/resume", label: "Resume", glyph: "§" },
  { href: "/people", label: "People", glyph: "◇" },
  { href: "/settings", label: "Settings", glyph: "✦" },
];

const INCOMING = [
  { label: "Opportunities", glyph: "◇" },
  { label: "Inbox triage", glyph: "✉" },
  { label: "Calendar", glyph: "▢" },
  { label: "Research", glyph: "◎" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/today")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const due = Array.isArray(j?.due) ? j.due.length : 0;
        const rev = Array.isArray(j?.reviews) ? j.reviews.length : 0;
        setTodayCount(due + rev);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--color-line)]/60 bg-[color:var(--color-cream)] px-4 py-3">
        <Link href="/compose" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-clay)] text-white text-sm font-medium">
            J
          </span>
          <span className="text-sm font-semibold text-[color:var(--color-ink)]">Jugaadu</span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-line)] text-[color:var(--color-ink)]"
        >
          <span className="text-lg leading-none">≡</span>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
        >
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] border-r border-[color:var(--color-line)]/60 bg-[color:var(--color-cream)] flex flex-col overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody
              pathname={pathname}
              todayCount={todayCount}
              onNav={() => setOpen(false)}
              closeButton
              onClose={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-[color:var(--color-line)]/60 bg-[color:var(--color-cream)] flex-col">
        <SidebarBody pathname={pathname} todayCount={todayCount} />
      </aside>
    </>
  );
}

function SidebarBody({
  pathname,
  todayCount,
  onNav,
  closeButton,
  onClose,
}: {
  pathname: string;
  todayCount: number | null;
  onNav?: () => void;
  closeButton?: boolean;
  onClose?: () => void;
}) {
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div className="px-5 py-5 flex items-start justify-between">
        <Link href="/compose" onClick={onNav} className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-clay)] text-white text-lg font-medium">
            J
          </span>
          <span className="leading-tight">
            <div className="text-base font-semibold text-[color:var(--color-ink)]">Jugaadu</div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-muted)]">
              Sam · Beta
            </div>
          </span>
        </Link>
        {closeButton && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="text-[color:var(--color-ink-muted)] text-lg leading-none px-2"
          >
            ×
          </button>
        )}
      </div>

      <div className="px-3">
        <Link
          href="/compose"
          onClick={onNav}
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
          const badge = l.href === "/today" && todayCount && todayCount > 0 ? todayCount : null;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNav}
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
              {badge ? (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[color:var(--color-clay)]/30 px-1.5 py-0.5 text-[10px] text-[color:var(--color-clay-dark)]">
                  {badge}
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
        jugaadu.app
      </div>
    </>
  );
}
