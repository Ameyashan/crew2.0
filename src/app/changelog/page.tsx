"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import type { Palette } from "@/components/paper/palette";
import { useIsMobile } from "@/lib/use-is-mobile";
import { KIND_META, type Changelog, type ChangeKind } from "@/lib/changelog";

/* ─────────────────────── small shared primitives ─────────────────────── */

function JugaaduMark({ p, size = 44 }: { p: Palette; size?: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 10,
        background: p.stamp,
        color: p.paper,
        display: "grid",
        placeItems: "center",
        fontFamily: PAPER_FONTS.display,
        fontSize: size * 0.6,
        boxShadow: `4px 4px 0 ${p.ink}`,
        flexShrink: 0,
      }}
    >
      <span style={{ lineHeight: 1, transform: "translateY(-1px)" }}>J</span>
      <span
        style={{
          position: "absolute",
          right: 5,
          top: 5,
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: 999,
          background: p.marigold,
          border: `1.5px solid ${p.ink}`,
        }}
      />
    </div>
  );
}

function InkRule({ p }: { p: Palette }) {
  return (
    <div>
      <div style={{ height: 3, background: p.ink }} />
      <div style={{ height: 3 }} />
      <div style={{ height: 1, background: p.ink }} />
    </div>
  );
}

function toneColor(p: Palette, tone: "marigold" | "leaf" | "stamp" | "tea") {
  return p[tone];
}

/* A coloured stamp-style tag for a change category. */
function KindTag({ p, kind }: { p: Palette; kind: ChangeKind }) {
  const meta = KIND_META[kind];
  const c = toneColor(p, meta.tone);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1.5px solid ${c}`,
        color: c,
        padding: "2px 8px",
        borderRadius: 3,
        fontFamily: PAPER_FONTS.mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        background: `${c}12`,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

/* ─────────────────────────────── page ─────────────────────────────── */

export default function ChangelogPage() {
  const { p } = usePaperTheme();
  const isMobile = useIsMobile();
  const [data, setData] = useState<Changelog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((d: Changelog) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ editions: [], total: 0, error: "network" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      className="scroll"
      style={{
        minHeight: "100dvh",
        background: p.paper,
        color: p.ink,
        fontFamily: PAPER_FONTS.sans,
        backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,.012) 0 1px, transparent 1px 3px)`,
      }}
    >
      {/* masthead */}
      <header
        style={{
          padding: isMobile ? "18px 20px 14px" : "26px 56px 18px",
          maxWidth: 940,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/home"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <JugaaduMark p={p} />
            <div>
              <div
                style={{
                  fontFamily: PAPER_FONTS.devan,
                  fontWeight: 700,
                  fontSize: 13,
                  color: p.stamp,
                  lineHeight: 1,
                }}
              >
                जुगाडू · ख़बरें
              </div>
              <div
                style={{
                  fontFamily: PAPER_FONTS.display,
                  fontSize: isMobile ? 30 : 38,
                  lineHeight: 1,
                  marginTop: 3,
                  color: p.ink,
                }}
              >
                The Changelog<span style={{ color: p.stamp }}>.</span>
              </div>
            </div>
          </Link>
          <span
            style={{
              fontFamily: PAPER_FONTS.caveat,
              fontSize: 21,
              color: p.tea,
              transform: "rotate(-1.5deg)",
              display: "inline-block",
            }}
          >
            everything we&apos;ve shipped — hot off the press ↗
          </span>
        </div>

        <div style={{ height: 14 }} />
        <InkRule p={p} />

        {/* dateline / summary strip */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            fontFamily: PAPER_FONTS.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: p.inkMute,
          }}
        >
          <span>Vol. I · straight from the commits</span>
          <span>
            {data && !data.error
              ? `${data.total} changes · ${data.editions.length} editions`
              : " "}
          </span>
        </div>
      </header>

      {/* body */}
      <main
        style={{
          maxWidth: 940,
          margin: "0 auto",
          padding: isMobile ? "20px 20px 60px" : "28px 56px 80px",
        }}
      >
        {loading && <SkeletonState p={p} />}

        {!loading && data?.error && (
          <EmptyState
            p={p}
            title="Press paused"
            body="We couldn't reach the print room (GitHub) just now. Refresh in a bit and the latest edition will roll off."
          />
        )}

        {!loading && data && !data.error && data.editions.length === 0 && (
          <EmptyState
            p={p}
            title="No editions yet"
            body="Nothing has shipped that we'd put on the front page — check back soon."
          />
        )}

        {!loading &&
          data &&
          !data.error &&
          data.editions.map((edition, idx) => (
            <EditionBlock
              key={edition.date}
              p={p}
              edition={edition}
              isMobile={isMobile}
              isLatest={idx === 0}
            />
          ))}
      </main>
    </div>
  );
}

/* ─────────────────────────── edition block ─────────────────────────── */

function EditionBlock({
  p,
  edition,
  isMobile,
  isLatest,
}: {
  p: Palette;
  edition: Changelog["editions"][number];
  isMobile: boolean;
  isLatest: boolean;
}) {
  return (
    <section style={{ display: "flex", gap: isMobile ? 14 : 22, marginBottom: 8 }}>
      {/* timeline rail */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 14,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: 999,
              background: isLatest ? p.stamp : p.card,
              border: `2.5px solid ${isLatest ? p.stamp : p.ink}`,
              marginTop: 6,
              boxShadow: isLatest ? `0 0 0 4px ${p.stamp}22` : "none",
            }}
          />
          <span style={{ flex: 1, width: 2, background: p.rule, marginTop: 4 }} />
        </div>
      )}

      {/* edition card */}
      <article
        style={{
          flex: 1,
          minWidth: 0,
          marginBottom: 28,
          background: p.card,
          border: `2px solid ${p.ink}`,
          boxShadow: `6px 6px 0 ${isLatest ? p.marigold : p.rule}`,
        }}
      >
        {/* edition header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: isMobile ? "12px 16px" : "14px 20px",
            borderBottom: `1px solid ${p.rule}`,
            background: p.paperShade,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: PAPER_FONTS.display,
              fontSize: isMobile ? 22 : 28,
              lineHeight: 1.05,
              color: p.ink,
            }}
          >
            {edition.label}
          </h2>
          <span
            style={{
              fontFamily: PAPER_FONTS.mono,
              fontSize: 10,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: isLatest ? p.stamp : p.inkMute,
              border: `1px solid ${isLatest ? p.stamp : p.rule}`,
              padding: "2px 8px",
              borderRadius: 3,
            }}
          >
            {isLatest ? "Latest" : `${edition.entries.length} ${
              edition.entries.length === 1 ? "change" : "changes"
            }`}
          </span>
        </div>

        {/* entries */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {edition.entries.map((entry, i) => (
            <li
              key={entry.sha}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: isMobile ? 10 : 14,
                padding: isMobile ? "12px 16px" : "13px 20px",
                borderTop: i === 0 ? "none" : `1px solid ${p.rule}`,
                flexWrap: "wrap",
              }}
            >
              <div style={{ paddingTop: 1 }}>
                <KindTag p={p} kind={entry.kind} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div
                  style={{
                    fontFamily: PAPER_FONTS.serif,
                    fontSize: isMobile ? 15 : 16,
                    lineHeight: 1.35,
                    color: p.ink,
                  }}
                >
                  {entry.title}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: PAPER_FONTS.mono,
                    fontSize: 10,
                    letterSpacing: ".04em",
                    color: p.inkMute,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>by {entry.author}</span>
                  <span aria-hidden>·</span>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: p.tea, textDecoration: "none" }}
                  >
                    {entry.short} ↗
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

/* ─────────────────────────── states ─────────────────────────── */

function SkeletonState({ p }: { p: Palette }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: p.card,
            border: `2px solid ${p.rule}`,
            padding: 20,
            opacity: 0.6,
          }}
        >
          <div
            style={{ height: 22, width: "42%", background: p.paperShade, borderRadius: 3 }}
          />
          <div
            style={{ height: 14, width: "78%", background: p.paperShade, borderRadius: 3, marginTop: 16 }}
          />
          <div
            style={{ height: 14, width: "64%", background: p.paperShade, borderRadius: 3, marginTop: 10 }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ p, title, body }: { p: Palette; title: string; body: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        border: `2px dashed ${p.rule}`,
        background: p.card,
      }}
    >
      <div
        style={{
          fontFamily: PAPER_FONTS.display,
          fontSize: 28,
          color: p.ink,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: "0 auto",
          maxWidth: 460,
          fontFamily: PAPER_FONTS.serifAlt,
          fontStyle: "italic",
          fontSize: 18,
          color: p.inkSoft,
          lineHeight: 1.4,
        }}
      >
        {body}
      </p>
    </div>
  );
}
