"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
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
import type { FeedItem, FollowingItem, PreferencesDTO } from "@/lib/jobs/types";

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
      {visaChipLabel(item.visa_confidence)}
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
        {reasons}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flex: "none" }}>
        {fitBox}
        {visaChip}
      </div>
    </div>
  );
}

// "New at companies you follow" — a recency-first strip above the ranked feed.
// Independent of fit score: the point is the company, not the match. Fresh
// listings (first seen <24h) get a green NEW badge. Renders nothing when empty
// so it never nags.
function FollowingStrip({
  items,
  followedCount,
  isMobile,
  onOpen,
}: {
  items: FollowingItem[];
  followedCount: number;
  isMobile: boolean;
  onOpen: (jobId: string) => void;
}) {
  // Nothing to say only when the user follows no companies at all. When they
  // follow companies but nothing currently fits, say so — otherwise following
  // reads as a no-op.
  if (!items.length && followedCount === 0) return null;
  const freshCount = items.filter((i) => i.is_fresh).length;
  return (
    <div
      style={{
        border: `1px solid ${TOKENS.amberLine}`,
        background: TOKENS.cardWarm,
        borderRadius: RADII.card,
        padding: isMobile ? "16px 16px 8px" : "18px 20px 10px",
        marginBottom: 26,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontSize: 10.5,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: TOKENS.amber,
          }}
        >
          New at companies you follow
        </span>
        {freshCount > 0 && (
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: TOKENS.muted }}>
            {freshCount} in the last 24h
          </span>
        )}
      </div>
      {items.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it, i) => (
            <FollowingRow key={it.job_id} item={it} onOpen={() => onOpen(it.job_id)} first={i === 0} />
          ))}
        </div>
      ) : (
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: TOKENS.muted2,
          }}
        >
          No new roles matching your preferences at the {followedCount === 1 ? "company" : `${followedCount} companies`}{" "}
          you follow yet — we&apos;ll surface them here as they open.
        </p>
      )}
    </div>
  );
}

function FollowingRow({ item, onOpen, first }: { item: FollowingItem; onOpen: () => void; first: boolean }) {
  const [hover, setHover] = useState(false);
  const posted = postedAgo(item.posted_date, item.posted_date_approx);
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 8px",
        borderTop: first ? "none" : `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.buttonTight,
        background: hover ? TOKENS.hoverWash : "transparent",
        cursor: "pointer",
      }}
    >
      <CompanyLogo company={item.company} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: PAPER_FONTS_V2.serif,
            fontSize: 15,
            lineHeight: 1.3,
            color: TOKENS.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </div>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, lineHeight: 1.4, color: TOKENS.muted }}>
          {item.company}
          {item.location ? ` · ${item.location}` : ""}
          {posted ? ` · ${posted}` : ""}
        </div>
      </div>
      {item.is_fresh && (
        <span
          style={{
            fontFamily: PAPER_FONTS_V2.mono,
            fontWeight: 500,
            fontSize: 9.5,
            letterSpacing: ".08em",
            color: TOKENS.green,
            background: TOKENS.greenBg,
            borderRadius: 4,
            padding: "4px 7px",
            flex: "none",
          }}
        >
          NEW
        </span>
      )}
    </div>
  );
}

export default function JobsFeedPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [belowBar, setBelowBar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [filters, setFilters] = useState<FeedFilters>(NO_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Guard so the "empty feed but preferences exist" auto-scan fires at most once.
  // A ref (not state) so setting it doesn't itself trigger a render/effect cycle.
  const autoScanned = useRef(false);

  const fetchFeed = useCallback(() => fetch("/api/jobs/feed").then((r) => r.json()), []);

  // Follow state lives in two places: the set of followed company_ids (drives
  // each card's button) and the recency strip's rows. Loaded together and
  // reloaded whenever a follow toggles.
  const loadFollowing = useCallback(async () => {
    try {
      const [ids, recent] = await Promise.all([
        fetch("/api/jobs/follow").then((r) => r.json()),
        fetch("/api/jobs/following").then((r) => r.json()),
      ]);
      setFollowedIds(new Set(Array.isArray(ids?.company_ids) ? ids.company_ids : []));
      setFollowing(Array.isArray(recent?.recent) ? recent.recent : []);
    } catch {
      /* strip is best-effort; a failure just leaves it empty */
    }
  }, []);

  // Optimistically reflect a card's toggle in the followed set, then refresh the
  // strip so a newly-followed company's recent roles appear (or a removed one's
  // drop off).
  const onToggleFollow = useCallback(
    (companyId: string, isFollowing: boolean) => {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(companyId);
        else next.delete(companyId);
        return next;
      });
      void loadFollowing();
    },
    [loadFollowing],
  );

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
        void loadFollowing();
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
  }, [fetchFeed, applyFeed, loadFollowing]);

  useEffect(() => {
    // Mirror the accepted feed-load pattern below (setState inside a .then, not
    // synchronously in the effect body) rather than calling loadFollowing here.
    let alive = true;
    Promise.all([
      fetch("/api/jobs/follow").then((r) => r.json()).catch(() => null),
      fetch("/api/jobs/following").then((r) => r.json()).catch(() => null),
    ]).then(([ids, recent]) => {
      if (!alive) return;
      setFollowedIds(new Set(Array.isArray(ids?.company_ids) ? ids.company_ids : []));
      setFollowing(Array.isArray(recent?.recent) ? recent.recent : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // Load the feed and preferences together so we can decide, once, whether to
    // auto-scan: preferences (from onboarding or the prefs page) only grow the
    // catalog — they never fill `job_matches`, so a brand-new user's first Jobs
    // visit is empty until a scan runs. If we have usable preferences and an
    // empty feed, kick the scan automatically instead of making the user find
    // and click "Refresh".
    Promise.all([
      fetchFeed().catch((e) => ({ error: String(e?.message || e) })),
      fetch("/api/jobs/preferences")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([feed, prefsJson]) => {
      if (!alive) return;
      applyFeed(feed);
      const p: PreferencesDTO | null = prefsJson?.preferences ?? null;
      if (p) setPrefs(p);
      const hasPrefs =
        (p?.interests?.length ?? 0) > 0 ||
        (p?.pins?.length ?? 0) > 0 ||
        (p?.target_roles?.length ?? 0) > 0;
      const feedEmpty = !feed?.error && (feed?.jobs?.length ?? 0) === 0;
      if (feedEmpty && hasPrefs && !autoScanned.current) {
        autoScanned.current = true;
        void refresh();
      }
    });
    return () => {
      alive = false;
    };
  }, [fetchFeed, applyFeed, refresh]);

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

      <FollowingStrip
        items={following}
        followedCount={followedIds.size}
        isMobile={isMobile}
        onOpen={(jobId) => router.push(`/app/jobs/${jobId}`)}
      />

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
          Nothing clears your fit bar right now, so these are the closest matches we have. Try Refresh, or broaden
          your preferences to bring in stronger fits.
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
            Refreshes every morning · fit re-ranks as your Story grows
          </div>
        </>
      )}
    </div>
  );
}
