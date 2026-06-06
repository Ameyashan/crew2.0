"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PageHead, PaperCard, Eyebrow, InkButton } from "@/components/paper/primitives";
import { PAPER_FONTS } from "@/components/paper/fonts";

export function RouteStub({
  eyebrow,
  title,
  italic,
  sub,
  legacyHref,
  legacyLabel = "Open the legacy screen",
  children,
}: {
  eyebrow: string;
  title: string;
  italic?: string;
  sub: string;
  legacyHref: string;
  legacyLabel?: string;
  children?: ReactNode;
}) {
  const { p } = usePaperTheme();
  return (
    <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "48px 56px 80px" }}>
      <PageHead p={p} eyebrow={eyebrow} title={title} italic={italic} sub={sub} />

      <PaperCard p={p} color={p.marigold} hardShadow style={{ marginTop: 8 }}>
        <Eyebrow p={p} en="Stub · PR 1 shell" />
        <div
          style={{
            fontFamily: PAPER_FONTS.display,
            fontSize: 22,
            marginTop: 4,
            marginBottom: 10,
          }}
        >
          This screen will be redesigned in a follow-up PR.
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: PAPER_FONTS.serif,
            fontStyle: "italic",
            fontSize: 15,
            color: p.inkSoft,
            maxWidth: 620,
          }}
        >
          The data layer and existing flow are still wired up at the legacy route. Use the link
          below to access them while the paper-craft version is built out.
        </p>
        <div style={{ marginTop: 14 }}>
          <Link href={legacyHref} style={{ textDecoration: "none" }}>
            <InkButton p={p} color={p.stamp}>
              {legacyLabel} →
            </InkButton>
          </Link>
        </div>
      </PaperCard>

      {children && <div style={{ marginTop: 20 }}>{children}</div>}
    </div>
  );
}
