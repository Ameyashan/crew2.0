"use client";

import Link from "next/link";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { useActiveGoal } from "./use-active-goal";

// Settings → "What Jugaadu reads": the locked goal, linking to /app/goal where
// it's viewed, edited and refined with the coach.
export function GoalSettingsRow() {
  const active = useActiveGoal();
  const on = !!active;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: `1px solid ${TOKENS.lineInset}`,
        borderRadius: RADII.panelTight,
        background: TOKENS.cardWarm,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          background: on ? TOKENS.green : "transparent",
          border: `1px solid ${on ? TOKENS.green : TOKENS.line}`,
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
          color: TOKENS.paper,
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        {on ? "✓" : ""}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 13.5, color: TOKENS.ink }}>Your goal</div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 11,
            color: TOKENS.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {active === undefined ? "…" : active ? active.goal.short_label : "Not set yet — a 2-minute chat"}
        </div>
      </div>
      <Link
        href="/app/goal"
        style={{
          flexShrink: 0,
          padding: "6px 12px",
          borderRadius: RADII.buttonTight,
          border: `1px solid ${TOKENS.line}`,
          color: TOKENS.ink,
          textDecoration: "none",
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}
      >
        {on ? "Refine" : "Set"}
      </Link>
    </div>
  );
}
