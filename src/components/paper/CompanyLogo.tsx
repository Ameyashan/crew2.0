"use client";

import { useState } from "react";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { companyDomain, companyMonogram } from "@/lib/jobs/format";

// A small, square, rounded company avatar for the job feed. We don't store
// logos, so we guess the company's domain from its name and pull the brand mark
// from Google's public favicon endpoint (Clearbit's free logo API is gone).
// Google answers 200 with a generic 16×16 globe when it has nothing, so besides
// onError we also reject tiny images on load. Any miss (bad guess, no favicon,
// offline) falls back to a calm monogram tile, so the slot is always filled and
// the layout never shifts.
export function CompanyLogo({ company, size = 40 }: { company: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = companyDomain(company);
  const showImg = !failed && !!domain;

  const box = {
    width: size,
    height: size,
    flex: "none" as const,
    borderRadius: RADII.panelTight,
    border: `1px solid ${TOKENS.lineSoft}`,
    background: TOKENS.cardWarm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  if (showImg) {
    return (
      <div style={box} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // The "no favicon found" globe comes back at 16×16 regardless of
            // the requested size — treat it as a miss.
            if (e.currentTarget.naturalWidth <= 16) setFailed(true);
          }}
          style={{ width: "72%", height: "72%", objectFit: "contain", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div style={box} aria-hidden>
      <span
        style={{
          fontFamily: PAPER_FONTS_V2.serif,
          fontSize: Math.round(size * 0.42),
          lineHeight: 1,
          color: TOKENS.muted2,
        }}
      >
        {companyMonogram(company)}
      </span>
    </div>
  );
}
