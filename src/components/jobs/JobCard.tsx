"use client";

import { useState, type KeyboardEvent } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { FollowButton } from "@/components/paper/FollowButton";
import { postedAgo, compDisplay, fitColors, visaChipLabel, visaChipColors } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

// One scored role in a ranked feed: company, title, FIT score, visa chip,
// pay vs the goal's floor and the scorer's "why". Shared by Recommended and
// the Jobs tab's goal view.
export function JobCard({
  item,
  isMobile,
  onOpen,
  following,
  onToggleFollow,
}: {
  item: FeedItem;
  isMobile: boolean;
  onOpen: () => void;
  following: boolean;
  onToggleFollow: (companyId: string, following: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const posted = postedAgo(item.posted_date, item.posted_date_approx);
  const comp = compDisplay(item.compensation);
  const fit = fitColors(item.score);
  const visaColors = visaChipColors(item.visa_confidence);
  const followBtn = (
    <FollowButton companyId={item.company_id} following={following} onChange={onToggleFollow} compact />
  );

  // Shared pieces so the mobile and desktop layouts stay in sync.
  const fitBox = (
    <div
      style={{
        border: `1px solid ${fit.border}`,
        color: fit.color,
        borderRadius: RADII.button,
        padding: "9px 11px",
        textAlign: "center",
      }}
    >
      <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontWeight: 500, fontSize: 17, lineHeight: 1 }}>
        {item.score}
      </div>
      <div
        style={{
          fontFamily: PAPER_FONTS_V2.mono,
          fontWeight: 500,
          fontSize: 8.5,
          lineHeight: 1,
          letterSpacing: ".1em",
          marginTop: 4,
        }}
      >
        FIT
      </div>
    </div>
  );

  const visaChip = (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontWeight: 500,
        fontSize: 10,
        lineHeight: 1,
        color: visaColors.color,
        background: visaColors.bg,
        borderRadius: 4,
        padding: "5px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {visaChipLabel(item.visa_confidence, item.visa_evidence)}
    </span>
  );

  const companyName = (
    <span
      style={{
        fontFamily: PAPER_FONTS_V2.mono,
        fontWeight: 500,
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: ".1em",
        color: TOKENS.muted,
      }}
    >
      {item.company}
    </span>
  );
  const postedLabel = posted && (
    <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, lineHeight: 1, color: TOKENS.faint }}>
      posted {posted}
    </span>
  );
  const metaLine = (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted }}>
      {item.location ? `${item.location} · ` : ""}
      <span style={{ color: comp.listed ? TOKENS.green : TOKENS.faint }}>{comp.label}</span>
      {item.comp_fit === "meets" && <span style={{ color: TOKENS.green }}> · clears your pay floor</span>}
    </div>
  );
  // Why this employer is tracked (Fortune 500 / top startup / top H-1B
  // sponsor) — context a visa seeker weighs, kept quieter than the visa chip.
  const badgeRow = item.badges?.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: isMobile ? 0 : 7 }}>
      {item.badges.map((b) => (
        <span
          key={b}
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontWeight: 500,
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: TOKENS.muted2,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: 4,
            padding: "4px 7px",
            whiteSpace: "nowrap",
          }}
        >
          {b}
        </span>
      ))}
    </div>
  ) : null;
  const reasons = item.reasons && (
    <div
      style={{
        fontFamily: PAPER_FONTS_V2.serif,
        fontStyle: "italic",
        fontSize: 14,
        lineHeight: 1.55,
        color: TOKENS.muted2,
        marginTop: isMobile ? 0 : 9,
      }}
    >
      {item.reasons}
    </div>
  );

  const cardBase = {
    background: TOKENS.card,
    border: `1px solid ${hover ? TOKENS.faint : TOKENS.lineSoft}`,
    borderRadius: RADII.card,
    boxShadow: hover ? "0 2px 12px rgba(60,50,30,.07)" : "none",
    cursor: "pointer",
    transition: "border-color .15s ease, box-shadow .15s ease",
  } as const;

  const interactions = {
    role: "button" as const,
    tabIndex: 0,
    onClick: onOpen,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };

  if (isMobile) {
    // Stacked layout: a compact company/posted line, then the title beside the
    // FIT score on one row, then the location and "why it matches" spanning the
    // full card width.
    return (
      <div {...interactions} style={{ ...cardBase, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <CompanyLogo company={item.company} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {companyName}
            {postedLabel}
          </div>
          <div style={{ marginLeft: "auto", flex: "none" }}>{followBtn}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: PAPER_FONTS_V2.serif,
              fontWeight: 400,
              fontSize: 19,
              lineHeight: 1.3,
              color: TOKENS.ink,
            }}
          >
            {item.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "none" }}>
            {fitBox}
            {visaChip}
          </div>
        </div>
        {metaLine}
        {badgeRow}
        {reasons}
      </div>
    );
  }

  return (
    <div {...interactions} style={{ ...cardBase, padding: "20px 24px", display: "flex", gap: 20 }}>
      <CompanyLogo company={item.company} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          {companyName}
          {postedLabel}
          <div style={{ marginLeft: "auto", flex: "none" }}>{followBtn}</div>
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 20,
            lineHeight: 1.3,
            color: TOKENS.ink,
            marginBottom: 5,
          }}
        >
          {item.title}
        </div>
        {metaLine}
        {badgeRow}
        {reasons}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flex: "none" }}>
        {fitBox}
        {visaChip}
      </div>
    </div>
  );
}
