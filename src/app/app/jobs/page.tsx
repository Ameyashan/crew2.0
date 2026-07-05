"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  postedAgo,
  compDisplay,
  fitColors,
  visaChipLabel,
  visaChipColors,
  goalPhrase,
  filterJobs,
  NO_FILTERS,
  type FeedFilters,
} from "@/lib/jobs/format";
import { sectorLabel } from "@/lib/jobs/catalog/sectors";
import type { FeedItem, PreferencesDTO } from "@/lib/jobs/types";

// A single filter pill (visa / remote / comp). Active = ink bg, paper text.
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 11.5,
        lineHeight: 1,
        color: active ? TOKENS.paper : TOKENS.muted2,
        background: active ? TOKENS.ink : TOKENS.card,
        border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.pill,
        padding: "8px 13px",
        cursor: "pointer",
      }}
    >
      {label}
    </span>
  );
}

// A quiet text affordance (Refresh / Edit preferences) — subtle, pill-shaped.
function QuietPill({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        lineHeight: 1,
        color: TOKENS.muted2,
        background: "transparent",
        border: `1px solid ${TOKENS.line}`,
        borderRadius: RADII.button,
        padding: "9px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function JobCard({ item, onOpen }: { item: FeedItem; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const posted = postedAgo(item.posted_date, item.posted_date_approx);
  const comp = compDisplay(item.compensation);
  const fit = fitColors(item.score);
  const visaColors = visaChipColors(item.visa_confidence);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        background: TOKENS.card,
        border: `1px solid ${hover ? TOKENS.faint : TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: hover ? "0 2px 12px rgba(60,50,30,.07)" : "none",
        padding: "20px 24px",
        display: "flex",
        gap: 20,
        cursor: "pointer",
        transition: "border-color .15s ease, box-shadow .15s ease",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
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
          {posted && (
            <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, lineHeight: 1, color: TOKENS.faint }}>
              posted {posted}
            </span>
          )}
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
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: TOKENS.muted }}>
          {item.location ? `${item.location} · ` : ""}
          <span style={{ color: comp.listed ? TOKENS.green : TOKENS.faint }}>{comp.label}</span>
        </div>
        {item.reasons && (
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.55,
              color: TOKENS.muted2,
              marginTop: 9,
            }}
          >
            {item.reasons}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flex: "none" }}>
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
          {visaChipLabel(item.visa_confidence)}
        </span>
      </div>
    </div>
  );
}

export default function JobsFeedPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>(NO_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchFeed = useCallback(() => fetch("/api/jobs/feed").then((r) => r.json()), []);

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
    fetchFeed()
      .then((j) => {
        if (alive) applyFeed(j);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      });
    fetch("/api/jobs/preferences")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.preferences) setPrefs(j.preferences as PreferencesDTO);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetchFeed, applyFeed]);

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
        applyFeed(await fetchFeed());
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
  }, [fetchFeed, applyFeed]);

  const toggle = (key: keyof FeedFilters) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const visible = useMemo(() => (jobs ? filterJobs(jobs, filters) : []), [jobs, filters]);
  const total = jobs?.length ?? 0;
  const goal = goalPhrase((prefs?.interests ?? []).map(sectorLabel));

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflow: "auto",
        maxWidth: 920,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: isMobile ? "28px 18px 60px" : "44px 44px 60px",
        background: TOKENS.paper,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontWeight: 400,
            fontSize: 30,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            color: TOKENS.ink,
          }}
        >
          Today&apos;s jobs, picked for you
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <QuietPill onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </QuietPill>
          <QuietPill onClick={() => router.push("/app/jobs/preferences")}>Edit preferences</QuietPill>
        </div>
      </div>

      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.7,
          color: TOKENS.muted,
          maxWidth: 560,
          marginBottom: 24,
        }}
      >
        {total === 0 && jobs !== null
          ? "No matches yet — set or broaden your interests to fill this up."
          : jobs === null
            ? "Gathering the roles that fit your Story…"
            : `${total} role${total === 1 ? "" : "s"} ranked against your Story and what you said you're after: `}
        {jobs !== null && total > 0 && <em>{goal}</em>}
        {jobs !== null && total > 0 && "."}
      </div>

      {jobs !== null && total > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 26 }}>
          <FilterPill label="Sponsors visa" active={filters.sponsorsVisa} onClick={() => toggle("sponsorsVisa")} />
          <span style={{ width: 1, height: 18, background: TOKENS.line, margin: "0 4px" }} />
          <FilterPill label="Remote-friendly" active={filters.remote} onClick={() => toggle("remote")} />
          <FilterPill label="Comp listed" active={filters.compListed} onClick={() => toggle("compListed")} />
        </div>
      )}

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

      {error ? (
        <div
          style={{
            background: TOKENS.card,
            border: `1px solid ${TOKENS.lineSoft}`,
            borderRadius: RADII.card,
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
            We&apos;re scanning the boards that match your interests. New matches land here every morning — check back
            shortly.
          </p>
        </div>
      ) : total === 0 ? (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
          }}
        >
          <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 26, color: TOKENS.ink, lineHeight: 1.1 }}>
            No matches yet
          </div>
          <p
            style={{
              margin: "8px auto 18px",
              maxWidth: 480,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 16,
              color: TOKENS.inkSoft,
              lineHeight: 1.4,
            }}
          >
            Pick the sectors you care about and we&apos;ll fill this feed with roles that fit.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <QuietPill onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh feed"}
            </QuietPill>
            <QuietPill onClick={() => router.push("/app/jobs/preferences")}>Set your interests</QuietPill>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            padding: "40px 32px",
            textAlign: "center",
            border: `1px dashed ${TOKENS.dashed}`,
            borderRadius: RADII.card,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 16,
              color: TOKENS.inkSoft,
              lineHeight: 1.4,
            }}
          >
            No matches fit those filters. Loosen them to see the rest of your feed.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((item) => (
              <JobCard
                key={item.match_id || item.job_id}
                item={item}
                onOpen={() => router.push(`/app/jobs/${item.job_id}`)}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              lineHeight: 1.6,
              color: TOKENS.faint,
              marginTop: 18,
              textAlign: "center",
            }}
          >
            Refreshes every morning · fit re-ranks as your Story grows
          </div>
        </>
      )}
    </div>
  );
}
