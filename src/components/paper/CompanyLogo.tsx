"use client";

import { useState } from "react";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { companyDomain, companyMonogram } from "@/lib/jobs/format";

// A small, square, rounded company avatar for the job feed. We don't store
// logos, so we guess the company's domain from its name and pull the brand mark
// from Clearbit's public logo endpoint. Any miss (bad guess, no logo, offline)
// falls back to a calm monogram tile, so the slot is always filled and the
// layout never shifts.
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
          src={`https://logo.clearbit.com/${domain}`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
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
