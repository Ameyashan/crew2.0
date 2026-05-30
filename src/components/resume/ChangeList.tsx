import type { CSSProperties } from "react";
import type { Palette } from "@/components/paper/palette";
import { PAPER_FONTS } from "@/components/paper/fonts";
import type { ResumeChange, ResumeChangeKind } from "@/lib/agents/resume-tailor/types";

// The tailoring changelog: a per-edit "your version → tailored version, and why"
// list, so the user can see exactly what the Resume agent changed against their
// own resume. `compact` shrinks it to fit inside the narrow result card.
export function ChangeList({
  p,
  changes,
  compact = false,
}: {
  p: Palette;
  changes: ResumeChange[];
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: compact ? 11 : 14 }}>
      {changes.map((c, i) => {
        const m = kindMeta(p, c.kind);
        return (
          <div key={i} style={{ display: "grid", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                padding: "1px 6px", background: m.color + "24", color: m.color,
                fontFamily: PAPER_FONTS.mono, fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase",
              }}>{m.label}</span>
              {c.section ? (
                <span style={{
                  fontFamily: PAPER_FONTS.mono, fontSize: compact ? 9.5 : 10.5,
                  color: p.inkMute, letterSpacing: ".04em",
                }}>{c.section}</span>
              ) : null}
            </div>
            {c.before ? (
              <div style={{
                fontFamily: PAPER_FONTS.sans, fontSize: compact ? 11 : 12.5, lineHeight: 1.45,
                color: p.inkMute, textDecoration: "line-through", textDecorationColor: p.stamp + "99",
              }}>{c.before}</div>
            ) : null}
            {c.after ? (
              <div style={{
                fontFamily: PAPER_FONTS.sans, fontSize: compact ? 11.5 : 13, lineHeight: 1.45, color: p.ink,
              }}>{c.after}</div>
            ) : null}
            {c.reason ? (
              <div style={{
                fontFamily: PAPER_FONTS.serif, fontStyle: "italic",
                fontSize: compact ? 11 : 12.5, lineHeight: 1.4, color: p.inkSoft,
              } as CSSProperties}>— {c.reason}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function kindMeta(p: Palette, kind: ResumeChangeKind): { label: string; color: string } {
  switch (kind) {
    case "added":      return { label: "added",      color: p.leaf };
    case "reordered":  return { label: "moved up",   color: p.tea };
    case "emphasized": return { label: "emphasized", color: p.marigoldDeep };
    case "dropped":    return { label: "trimmed",    color: p.inkMute };
    default:           return { label: "rewrote",    color: p.marigoldDeep };
  }
}
