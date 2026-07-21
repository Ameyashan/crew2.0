"use client";

import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";

// A small "Follow / Following ✓" toggle for a company. Self-contained: it owns
// the POST/DELETE to /api/jobs/follow and updates optimistically, reverting on
// failure. `onChange(companyId, following)` lets a parent react (e.g. refresh
// the "New at companies you follow" strip). Renders nothing without a
// company_id (an unresolved listing can't be followed).
export function FollowButton({
  companyId,
  following: initial,
  onChange,
  compact = false,
}: {
  companyId: string | null;
  following: boolean;
  onChange?: (companyId: string, following: boolean) => void;
  compact?: boolean;
}) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  if (!companyId) return null;

  async function toggle(e: MouseEvent | KeyboardEvent) {
    // Feed cards are themselves clickable — never let the toggle open the job.
    e.stopPropagation();
    if (busy) return;
    const next = !following;
    setFollowing(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/jobs/follow", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onChange?.(companyId as string, next);
    } catch {
      setFollowing(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  const style: CSSProperties = {
    fontFamily: PAPER_FONTS_V2.mono,
    fontSize: compact ? 10.5 : 11.5,
    lineHeight: 1,
    letterSpacing: ".02em",
    color: following ? TOKENS.paper : hover ? TOKENS.ink : TOKENS.muted2,
    background: following ? TOKENS.ink : hover ? TOKENS.hoverWash : "transparent",
    border: `1px solid ${following ? TOKENS.ink : TOKENS.line}`,
    borderRadius: RADII.pill,
    padding: compact ? "5px 10px" : "6px 12px",
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
    whiteSpace: "nowrap",
    flex: "none",
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={following}
      aria-label={following ? "Unfollow company" : "Follow company"}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(e);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {following ? "Following ✓" : "＋ Follow"}
    </span>
  );
}
