"use client";

import Link from "next/link";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { useActiveGoal } from "./use-active-goal";

// Desk strip under the headline: what the crew is working toward, or a nudge
// to set it. Signed-in only; renders nothing while the goal is loading.
export function GoalStrip({ signedIn }: { signedIn: boolean | null }) {
  const active = useActiveGoal(signedIn === true);
  if (signedIn !== true || active === undefined) return null;

  const pill = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    maxWidth: "100%",
    boxSizing: "border-box" as const,
    borderRadius: RADII.pill,
    padding: "8px 16px",
    fontFamily: PAPER_FONTS_V2.sans,
    fontSize: 13,
    lineHeight: 1.3,
    textDecoration: "none",
    animation: "fadeUp .3s ease",
  };

  if (!active) {
    return (
      <Link
        href="/app/goal"
        style={{ ...pill, color: TOKENS.ink, background: TOKENS.card, border: `1px dashed ${TOKENS.dashed2}` }}
      >
        <span aria-hidden="true" style={{ color: TOKENS.green }}>
          ◎
        </span>
        <span>Set your goal — a 2-minute chat so the crew knows what to hunt for</span>
        <span aria-hidden="true">→</span>
      </Link>
    );
  }

  return (
    <Link
      href="/app/goal"
      style={{ ...pill, color: TOKENS.muted2, background: TOKENS.chip, border: `1px solid ${TOKENS.lineSoft}` }}
    >
      <span aria-hidden="true" style={{ color: TOKENS.green }}>
        ◎
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Working toward <span style={{ color: TOKENS.ink }}>{active.goal.short_label}</span>
      </span>
      <span style={{ color: TOKENS.faint2, whiteSpace: "nowrap" }}>· Refine</span>
    </Link>
  );
}
