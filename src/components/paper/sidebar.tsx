"use client";

import { usePathname, useRouter } from "next/navigation";
import { PAPER_FONTS } from "./fonts";
import type { Palette } from "./palette";

const APP_NAV = [
  { id: "compose", label: "Compose", hindi: "लिखो", glyph: "✎" },
  { id: "today", label: "Today", hindi: "आज", glyph: "◐" },
  { id: "resume", label: "Resume", hindi: "रेज़्यूमे", glyph: "§" },
  { id: "people", label: "People", hindi: "लोग", glyph: "◆" },
  { id: "settings", label: "Settings", hindi: "सेटिंग्स", glyph: "✦" },
] as const;

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
        <div
          style={{
            fontFamily: PAPER_FONTS.mono,
            fontSize: 9,
            letterSpacing: ".16em",
            color: p.inkMute,
            textTransform: "uppercase",
          }}
        >
          Vol. II · Console
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <div
            style={{
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
            C
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
              क्रू
            </div>
            <div
              style={{
                fontFamily: PAPER_FONTS.display,
                fontSize: 22,
                marginTop: 2,
                color: p.ink,
              }}
            >
              Crew<span style={{ color: p.stamp }}>.</span>
            </div>
          </div>
        </div>
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
          SAM · ALPHA
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
                gridTemplateColumns: "28px 1fr auto",
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
              <span
                style={{
                  fontFamily: PAPER_FONTS.devan,
                  fontSize: 11,
                  color: p.inkMute,
                  fontWeight: 700,
                  opacity: active ? 1 : 0.6,
                }}
              >
                {n.hindi}
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

      {/* Footer dispatch */}
      <div style={{ marginTop: "auto" }}>
        <div
          style={{
            padding: "12px 14px",
            background: p.card,
            border: `1.5px solid ${p.ink}`,
            boxShadow: `3px 3px 0 ${p.stamp}`,
          }}
        >
          <div
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 9.5,
              color: p.stamp,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            This week
          </div>
          <div
            style={{
              fontFamily: PAPER_FONTS.serif,
              fontStyle: "italic",
              fontSize: 13.5,
              lineHeight: 1.4,
              color: p.inkSoft,
            }}
          >
            You drafted{" "}
            <b
              style={{
                color: p.ink,
                fontFamily: PAPER_FONTS.display,
                fontStyle: "normal",
              }}
            >
              11
            </b>{" "}
            messages, sent{" "}
            <b
              style={{
                color: p.ink,
                fontFamily: PAPER_FONTS.display,
                fontStyle: "normal",
              }}
            >
              8
            </b>
            .{" "}
            <span
              style={{
                color: p.stamp,
                fontFamily: PAPER_FONTS.devan,
                fontStyle: "normal",
                fontWeight: 700,
              }}
            >
              दो
            </span>{" "}
            replied.
          </div>
        </div>
      </div>
    </aside>
  );
}
