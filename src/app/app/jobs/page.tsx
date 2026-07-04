"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
import { useIsMobile } from "@/lib/use-is-mobile";
import { relativePosted, visaBadge, sizeLabel, scoreTier } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

function scoreColor(score: number): string {
  const tier = scoreTier(score);
  return tier === "high" ? TOKENS.green : tier === "mid" ? TOKENS.gold : TOKENS.red;
}

function JobCard({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: () => void;
}) {
  const posted = relativePosted(item.posted_date, item.posted_date_approx);
  const visa = visaBadge(item.visa_confidence);
  const size = sizeLabel(item.company_size);
  const meta = [posted, item.location, item.compensation, size].filter(Boolean).join("  ·  ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "18px 20px",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10.5,
              color: TOKENS.red,
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            {item.company}
          </span>
          {item.is_new && (
            <span
              style={{
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 8.5,
                letterSpacing: ".14em",
                padding: "2px 8px",
                borderRadius: RADII.pill,
                border: `1px solid ${TOKENS.red}`,
                color: TOKENS.red,
                whiteSpace: "nowrap",
              }}
            >
              NEW
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 22,
            color: TOKENS.ink,
            lineHeight: 1.1,
            marginTop: 4,
          }}
        >
          {item.title}
        </div>
        {meta && (
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 11,
              color: TOKENS.muted,
              marginTop: 6,
              letterSpacing: ".02em",
            }}
          >
            {meta}
          </div>
        )}
        {item.reasons && (
          <div
            style={{
              marginTop: 8,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.4,
              color: TOKENS.muted2,
            }}
          >
            {item.reasons}
          </div>
        )}
        {visa && (
          <div
            style={{
              marginTop: 8,
              display: "inline-block",
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: TOKENS.green,
              background: TOKENS.greenBg,
              borderRadius: RADII.pill,
              padding: "3px 10px",
            }}
          >
            ✓ {visa}
          </div>
        )}
      </div>
      <span
        style={{
          display: "inline-block",
          fontFamily: PAPER_FONTS_V2.mono,
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: ".04em",
          color: scoreColor(item.score),
          border: `1px solid ${scoreColor(item.score)}`,
          borderRadius: RADII.buttonTight,
          padding: "6px 11px",
          background: TOKENS.card,
          whiteSpace: "nowrap",
        }}
      >
        {item.score}
      </span>
    </div>
  );
}

export default function JobsFeedPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNew, setOnlyNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchFeed = useCallback(
    (filterNew: boolean) => fetch(`/api/jobs/feed${filterNew ? "?filter=new" : ""}`).then((r) => r.json()),
    [],
  );

  const applyFeed = useCallback((j: { error?: string; jobs?: FeedItem[] }) => {
    if (j.error) {
      setError(j.error);
      setJobs([]);
    } else {
      setError(null);
      setJobs(Array.isArray(j.jobs) ? j.jobs : []);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchFeed(onlyNew)
      .then((j) => {
        if (alive) applyFeed(j);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      });
    return () => {
      alive = false;
    };
  }, [onlyNew, fetchFeed, applyFeed]);

  // Re-run the discovery pipeline against the user's saved preferences, then
  // pull the freshly-scored feed. Saving preferences only grows the catalog;
  // this is what actually fills (or refills) the matches.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setNote(null);
    try {
      const r = await fetch("/api/jobs/refresh", { method: "POST" });
      const j = await r.json();
      if (j.error) {
        setError(j.error);
      } else {
        applyFeed(await fetchFeed(onlyNew));
        if (j.reason === "no_preferences") {
          setNote("Set your interests first, then refresh to fill your feed.");
        } else if (j.candidates === 0) {
          setNote("No roles on the boards match your preferences right now — try broadening them.");
        } else if (j.scored === 0) {
          setNote("Your feed is already up to date — no new matches this time.");
        } else {
          setNote(`Added ${j.scored} new match${j.scored === 1 ? "" : "es"} to your feed.`);
        }
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setRefreshing(false);
    }
  }, [fetchFeed, applyFeed, onlyNew]);

  const total = jobs?.length ?? 0;
  const newCount = jobs?.filter((j) => j.is_new).length ?? 0;
  const summary =
    jobs === null
      ? "Gathering jobs that fit your interests…"
      : total === 0
        ? "Nothing matching your interests yet — set or broaden them to fill this up."
        : `${total} match${total === 1 ? "" : "es"}${newCount ? ` · ${newCount} new` : ""} · ranked by fit`;

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px", background: TOKENS.paper }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10.5,
              color: TOKENS.muted,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Jobs · picked for you
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: PAPER_FONTS_V2.serif,
              fontWeight: 400,
              fontSize: "clamp(40px, 4.8vw, 64px)",
              lineHeight: 0.95,
              letterSpacing: "-.02em",
              color: TOKENS.ink,
              textWrap: "balance",
            }}
          >
            Today&apos;s jobs, <span style={{ fontStyle: "italic", color: TOKENS.red }}>picked for you.</span>
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.45,
              color: TOKENS.inkSoft,
              maxWidth: 720,
            }}
          >
            {summary}
          </p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", gap: 8 }}>
          <InkButton2 kind="solid" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </InkButton2>
          <InkButton2 kind="outline" size="sm" onClick={() => router.push("/app/jobs/preferences")}>
            Edit preferences
          </InkButton2>
        </div>
      </div>

      {note && (
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 12,
            color: TOKENS.ink,
            border: `1px solid ${TOKENS.amberLine}`,
            background: TOKENS.amberWash,
            borderRadius: RADII.panelTight,
            padding: "8px 12px",
            marginBottom: 16,
          }}
        >
          {note}
        </div>
      )}

      {/* New-today toggle */}
      {jobs !== null && total > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[
            { v: false, label: "All matches" },
            { v: true, label: "New today" },
          ].map((o) => {
            const active = onlyNew === o.v;
            return (
              <button
                key={o.label}
                onClick={() => setOnlyNew(o.v)}
                style={{
                  padding: "6px 14px",
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 12,
                  background: active ? TOKENS.ink : "transparent",
                  color: active ? TOKENS.paper : TOKENS.ink,
                  border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                  borderRadius: RADII.pill,
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card,
            boxShadow: SHADOWS.card,
            padding: "20px 22px",
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, color: TOKENS.ink }}>
            Couldn&apos;t load your feed
          </div>
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red, marginTop: 6 }}>{error}</p>
        </div>
      ) : jobs === null ? (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
            background: "transparent",
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 26, color: TOKENS.ink, lineHeight: 1.1 }}>
            Warming up…
          </div>
          <p
            style={{
              margin: "8px auto 0",
              maxWidth: 480,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 16,
              color: TOKENS.inkSoft,
              lineHeight: 1.4,
            }}
          >
            We&apos;re scanning the boards that match your interests. New matches land here every morning — check back shortly.
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
            background: "transparent",
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 26, color: TOKENS.ink, lineHeight: 1.1 }}>
            {onlyNew ? "No new matches today" : "No matches yet"}
          </div>
          <p
            style={{
              margin: "8px auto 0",
              maxWidth: 480,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 16,
              color: TOKENS.inkSoft,
              lineHeight: 1.4,
            }}
          >
            {onlyNew
              ? "Nothing new since your last visit. Switch to All matches to see everything."
              : "Pick the sectors you care about and we'll fill this feed with roles that fit."}
          </p>
          <div style={{ marginTop: 18 }}>
            {onlyNew ? (
              <div style={{ display: "inline-flex" }}>
                <InkButton2 kind="solid" onClick={() => setOnlyNew(false)}>
                  See all matches
                </InkButton2>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <InkButton2 kind="solid" onClick={refresh} disabled={refreshing}>
                  {refreshing ? "Refreshing…" : "Refresh feed"}
                </InkButton2>
                <InkButton2 kind="outline" onClick={() => router.push("/app/jobs/preferences")}>
                  Set your interests
                </InkButton2>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((item) => (
            <JobCard
              key={item.match_id || item.job_id}
              item={item}
              onOpen={() => router.push(`/app/jobs/${item.job_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
