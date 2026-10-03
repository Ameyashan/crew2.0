"use client";

import { useCallback, useEffect, useState } from "react";
import { isReranking } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

// The scored feed (/api/jobs/feed) plus the user's tracked companies, shared by
// Recommended and the Jobs tab's goal view. Loads only — scoring costs tokens,
// so it runs when the user presses Refresh (`refresh`), never on page load.
// Right after a goal lock (`finalizedAt` recent, feed empty) it polls instead,
// since the background re-scan is filling the feed.
export function useJobFeed(finalizedAt: string | null | undefined) {
  const [jobs, setJobs] = useState<FeedItem[] | null>(null);
  const [belowBar, setBelowBar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Ticks while re-ranking so the window can close without a reload.
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchFeed = useCallback(() => fetch("/api/jobs/feed").then((r) => r.json()), []);

  // Following a company from a card adds it to the tracker.
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
    Promise.all([
      fetchFeed().catch((e) => ({ error: String(e?.message || e) })),
      fetch("/api/jobs/follow")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([feed, follows]) => {
      if (!alive) return;
      applyFeed(feed);
      setFollowedIds(new Set(Array.isArray(follows?.company_ids) ? follows.company_ids : []));
    });
    return () => {
      alive = false;
    };
  }, [fetchFeed, applyFeed]);

  const total = jobs?.length ?? 0;
  const reranking = !refreshing && jobs !== null && isReranking(finalizedAt, total, nowTick);

  useEffect(() => {
    if (!reranking) return;
    const t = setInterval(() => {
      setNowTick(Date.now());
      fetchFeed()
        .then(applyFeed)
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, [reranking, fetchFeed, applyFeed]);

  return { jobs, total, belowBar, error, followedIds, onToggleFollow, refreshing, note, refresh, reranking };
}
