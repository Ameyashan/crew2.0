"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PAPER_FONTS } from "./fonts";
import type { Palette } from "./palette";
import { supabaseBrowser } from "@/lib/supabase-browser";

const APP_NAV = [
  { id: "compose", label: "Compose", glyph: "✎" },
  { id: "today", label: "Today", glyph: "◐" },
  { id: "resume", label: "Resume", glyph: "§" },
  { id: "people", label: "People", glyph: "◆" },
  { id: "settings", label: "Settings", glyph: "✦" },
] as const;

// Turn an email local-part into a readable name, e.g. "ameya.shanbhag" → "Ameya Shanbhag".
function nameFromEmail(email?: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const COMING_SOON = [
  { id: "lekhak", label: "Article Publisher", glyph: "✎" },
  { id: "patrakar", label: "Research Briefer", glyph: "◐" },
  { id: "guru", label: "Upskill Coach", glyph: "✦" },
  { id: "khoji", label: "Network Mapper", glyph: "✶" },
];

export function SidebarV3({ p }: { p: Palette }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = APP_NAV.find((n) => pathname?.startsWith(`/app/${n.id}`))?.id ?? "compose";

  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Prefer the name saved on the profile; fall back to the signed-in account
    // (Google metadata or the email) so we never refer to a logged-in user as "Guest".
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const fromProfile =
          typeof j?.profile?.full_name === "string" ? j.profile.full_name.trim() : "";
        if (!cancelled && fromProfile) setName(fromProfile);
      })
      .catch(() => {});

    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const u = data?.user;
        if (!u) return;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const fallback =
          (typeof meta.full_name === "string" && meta.full_name.trim()) ||
          (typeof meta.name === "string" && meta.name.trim()) ||
          nameFromEmail(u.email);
        // Don't override a name already resolved from the profile.
        setName((prev) => prev ?? (fallback || null));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside
      style={{
        background: p.paperDeep,
        color: p.ink,
        borderRight: `1.5px solid ${p.ink}`,
        display: "flex",
        flexDirection: "column",
        padding: "22px 18px 18px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Masthead-y logo */}
      <div style={{ padding: "2px 8px 16px", borderBottom: `1px solid ${p.ink}40`, marginBottom: 14 }}>
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
        >
          <div
            style={{
              position: "relative",
              width: 32,
              height: 32,
              borderRadius: 6,
              background: p.stamp,
              color: p.paper,
              display: "grid",
              placeItems: "center",
              fontFamily: PAPER_FONTS.display,
              fontSize: 18,
              boxShadow: `3px 3px 0 ${p.ink}`,
            }}
          >
            J
            <span
              style={{
                position: "absolute",
                right: 3,
                top: 3,
                width: 6,
                height: 6,
                borderRadius: 999,
                background: p.marigold,
                border: `1px solid ${p.ink}`,
              }}
            />
          </div>
          <div style={{ lineHeight: 1 }}>
            <div
              style={{
                fontFamily: PAPER_FONTS.devan,
                fontWeight: 700,
                fontSize: 11,
                color: p.stamp,
                letterSpacing: ".02em",
              }}
            >
              जुगाडू
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS.display,
                fontSize: 22,
                marginTop: 2,
                color: p.ink,
              }}
            >
              Jugaadu<span style={{ color: p.stamp }}>.</span>
            </div>
          </div>
        </Link>
        <div
          style={{
            marginTop: 8,
            fontFamily: PAPER_FONTS.mono,
            fontSize: 9,
            color: p.inkMute,
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          {name ? `${name.toUpperCase()} · ALPHA` : "ALPHA"}
        </div>
      </div>

      {/* Primary nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {APP_NAV.map((n) => {
          const active = current === n.id;
          return (
            <button
              key={n.id}
              onClick={() => router.push(`/app/${n.id}`)}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                background: active ? p.card : "transparent",
                border: active ? `1.5px solid ${p.ink}` : "1.5px solid transparent",
                boxShadow: active ? `3px 3px 0 ${p.marigold}` : "none",
                textAlign: "left",
                cursor: "pointer",
                color: p.ink,
                transition: "background .15s",
              }}
            >
              <span
                style={{
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 14,
                  color: active ? p.stamp : p.inkMute,
                  textAlign: "center",
                }}
              >
                {n.glyph}
              </span>
              <span
                style={{
                  fontFamily: PAPER_FONTS.display,
                  fontSize: 16,
                  lineHeight: 1.05,
                  color: p.ink,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ height: 18 }} />

      {/* Coming soon rail */}
      <div style={{ padding: "0 10px 0" }}>
        <div
          style={{
            fontFamily: PAPER_FONTS.mono,
            fontSize: 9.5,
            letterSpacing: ".18em",
            color: p.inkMute,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Joining · the rest of the crew
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {COMING_SOON.map((a) => (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr auto",
                alignItems: "center",
                gap: 10,
                padding: "6px 6px",
                color: p.inkMute,
              }}
            >
              <span
                style={{
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 12,
                  textAlign: "center",
                  color: p.inkMute,
                }}
              >
                {a.glyph}
              </span>
              <span
                style={{
                  fontFamily: PAPER_FONTS.serif,
                  fontStyle: "italic",
                  fontSize: 14,
                  color: p.inkSoft,
                }}
              >
                {a.label}
              </span>
              <span
                style={{
                  fontFamily: PAPER_FONTS.mono,
                  fontSize: 8.5,
                  letterSpacing: ".14em",
                  padding: "2px 6px",
                  border: `1px solid ${p.ink}30`,
                  color: p.inkMute,
                  whiteSpace: "nowrap",
                }}
              >
                SOON
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
