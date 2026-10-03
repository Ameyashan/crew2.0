"use client";

import Link from "next/link";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import type { GoalProgressDTO } from "./use-goal-progress";

// Goal page funnel: strong matches → applications → submitted → messages →
// replies since the goal was set, the next-step nudge, and a refine prompt
// once the user keeps passing on matches. "Strong matches" is the same list
// the Jobs tab opens with, so that step links straight to it.
const MATCHES_HREF = "/app/jobs#strong-matches";

export function GoalProgress({ progress, onRefine }: { progress: GoalProgressDTO; onRefine?: () => void }) {
  return (
    <div
      style={{
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        background: TOKENS.card,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 22px" }}>
        {progress.steps.map((s, i) => {
          const count = (
            <span
              style={{
                fontFamily: PAPER_FONTS_V2.serif,
                fontSize: 24,
                lineHeight: 1,
                color: s.count ? TOKENS.ink : TOKENS.faint,
              }}
            >
              {s.count}
            </span>
          );
          const text = (
            <span style={{ fontFamily: PAPER_FONTS_V2.sans, fontSize: 12.5, color: TOKENS.muted2 }}>{s.label}</span>
          );
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {s.id === "strong_matches" ? (
                <Link
                  href={MATCHES_HREF}
                  title="See these roles on Jobs"
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 6,
                    textDecoration: "underline",
                    textDecorationColor: TOKENS.faint,
                    textUnderlineOffset: 4,
                  }}
                >
                  {count}
                  {text}
                </Link>
              ) : (
                <>
                  {count}
                  {text}
                </>
              )}
              {i < progress.steps.length - 1 && (
                <span aria-hidden="true" style={{ color: TOKENS.faint, marginLeft: 8 }}>
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 12,
          fontFamily: PAPER_FONTS_V2.serif,
          fontStyle: "italic",
          fontSize: 14.5,
          lineHeight: 1.5,
          color: TOKENS.inkSoft,
        }}
      >
        {progress.nudge}{" "}
        <Link href={MATCHES_HREF} style={{ color: TOKENS.ink, fontStyle: "normal", fontSize: 13 }}>
          Open your matches →
        </Link>
      </div>
      {progress.suggestRefine && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: TOKENS.amberWash,
            border: `1px solid ${TOKENS.amberLine}`,
            borderRadius: RADII.panelTight,
            padding: "9px 12px",
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 13,
            color: TOKENS.muted2,
          }}
        >
          <span>
            You&apos;ve passed on {progress.counts.dismissed_since_lock} matches under this goal — want to refine it?
          </span>
          {onRefine && (
            <button
              type="button"
              onClick={onRefine}
              style={{
                fontFamily: PAPER_FONTS_V2.sans,
                fontSize: 12,
                fontWeight: 500,
                color: TOKENS.paper,
                background: TOKENS.ink,
                border: "none",
                borderRadius: RADII.pill,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              Talk it through
            </button>
          )}
        </div>
      )}
    </div>
  );
}
