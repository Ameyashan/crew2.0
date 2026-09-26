"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode, type KeyboardEvent } from "react";
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
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { FollowButton } from "@/components/paper/FollowButton";
import type { FeedItem, PreferencesDTO } from "@/lib/jobs/types";

// The boolean (toggle) filter keys — `location` is free text and is set
// separately, so `toggle()` is scoped to just these.
type BooleanFilterKey = "sponsorsVisa" | "remote" | "compListed";

// Suggested locations for the filter datalist, on top of whatever's in the feed.
const MAJOR_US_CITIES = [
  "San Francisco, CA",
  "New York, NY",
  "Seattle, WA",
  "Austin, TX",
  "Los Angeles, CA",
  "Boston, MA",
  "Chicago, IL",
];

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

function JobCard({
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

// The AI-ranked feed ("Recommended"): jobs across the user's sectors and the
// company universe, scored against their Story by an LLM. Scoring costs
// tokens, so it runs only when the user presses Refresh — never on page load
// or on a schedule. The Jobs tab itself is the free company tracker
// (../page.tsx).
export default function RecommendedJobsPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [belowBar, setBelowBar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FeedFilters>(NO_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchFeed = useCallback(() => fetch("/api/jobs/feed").then((r) => r.json()), []);

  // Which companies the user tracks, so each card's Track button renders in
  // the right state. Following a company here adds it to the tracker.
  const onToggleFollow = useCallback((companyId: string, isFollowing: boolean) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
  }, []);

  const applyFeed = useCallback((j: { error?: string; jobs?: FeedItem[]; fallback?: boolean }) => {
    if (j.error) {
      setError(j.error);
      setJobs([]);
    } else {
      setError(null);
      setJobs(Array.isArray(j.jobs) ? j.jobs : []);
      setBelowBar(j.fallback === true);
    }
  }, []);

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

  useEffect(() => {
    let alive = true;
    // Load only — no automatic scan. An empty feed waits for the user to press
    // Refresh, which is the one place this page spends LLM tokens.
    Promise.all([
      fetchFeed().catch((e) => ({ error: String(e?.message || e) })),
      fetch("/api/jobs/preferences")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/jobs/follow")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([feed, prefsJson, follows]) => {
      if (!alive) return;
      applyFeed(feed);
      const p: PreferencesDTO | null = prefsJson?.preferences ?? null;
      if (p) setPrefs(p);
      setFollowedIds(new Set(Array.isArray(follows?.company_ids) ? follows.company_ids : []));
    });
    return () => {
      alive = false;
    };
  }, [fetchFeed, applyFeed]);

  const toggle = (key: BooleanFilterKey) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  // Filter only — the server's order is deliberate (score-ranked, then spread
  // across companies so one prolific board can't wall the feed); re-sorting by
  // raw score here would clump those companies back together.
  const visible = useMemo(() => (jobs ? filterJobs(jobs, filters) : []), [jobs, filters]);
  // Location suggestions for the filter's datalist: the distinct locations
  // actually in the feed, plus major US cities and Remote. The input still
  // accepts free text, so this is a convenience list, not a hard constraint.
  const locationOptions = useMemo(() => {
    const set = new Set<string>(["Remote"]);
    (jobs ?? []).forEach((j) => {
      if (j.location) set.add(j.location);
    });
    MAJOR_US_CITIES.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);
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
          Recommended for you
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
          <QuietPill onClick={() => router.push("/app/jobs")}>← Your tracker</QuietPill>
          <QuietPill onClick={refresh} disabled={refreshing}>
            {refreshing ? "Scoring…" : "Refresh"}
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
        {refreshing
          ? "Scoring roles against your Story — this can take a minute or two…"
          : total === 0 && jobs !== null
            ? "Roles across your sectors, ranked against your Story. Press Refresh to score them."
          : jobs === null
            ? "Loading your recommendations…"
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
          <span style={{ width: 1, height: 18, background: TOKENS.line, margin: "0 4px" }} />
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input
              list="feed-locations"
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
              placeholder="Location…"
              aria-label="Filter by location"
              style={{
                width: 150,
                boxSizing: "border-box",
                padding: filters.location ? "6px 24px 6px 12px" : "6px 12px",
                borderRadius: RADII.pill,
                border: `1px solid ${filters.location ? TOKENS.ink : TOKENS.line}`,
                background: TOKENS.card,
                color: TOKENS.ink,
                fontFamily: PAPER_FONTS_V2.mono,
                fontSize: 12.5,
                outline: "none",
              }}
            />
            {filters.location && (
              <button
                type="button"
                aria-label="Clear location filter"
                onClick={() => setFilters((f) => ({ ...f, location: "" }))}
                style={{
                  position: "absolute",
                  right: 8,
                  background: "transparent",
                  border: "none",
                  color: TOKENS.muted,
                  fontSize: 14,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ×
              </button>
            )}
            <datalist id="feed-locations">
              {locationOptions.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {belowBar && jobs !== null && total > 0 && (
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: TOKENS.muted2,
            border: `1px solid ${TOKENS.lineSoft}`,
            background: TOKENS.cardWarm,
            borderRadius: RADII.panelTight,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          Few roles clear your fit bar right now, so we&apos;re also showing the closest matches below. Try Refresh,
          or broaden your preferences to bring in stronger fits.
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
            Loading…
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
            Fetching your saved recommendations.
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
            {refreshing ? "Scoring your matches…" : "No recommendations yet"}
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
            {refreshing
              ? "We're pulling roles from your sectors and ranking them against your Story. Hang tight."
              : "Pick the sectors you care about, then press Refresh and we'll rank roles that fit."}
          </p>
          {!refreshing && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <QuietPill onClick={refresh}>Refresh</QuietPill>
              <QuietPill onClick={() => router.push("/app/jobs/preferences")}>Set your interests</QuietPill>
            </div>
          )}
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
                isMobile={isMobile}
                onOpen={() => router.push(`/app/jobs/${item.job_id}`)}
                following={!!item.company_id && followedIds.has(item.company_id)}
                onToggleFollow={onToggleFollow}
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
            Scored when you press Refresh · your tracker updates on its own
          </div>
        </>
      )}
    </div>
  );
}
