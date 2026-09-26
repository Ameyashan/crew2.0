// Fetch orchestrator (Module 1). Pulls every active catalog company's board,
// normalizes the listings, and idempotently upserts them into `jobs`.
//
// Idempotency / delta tracking:
//   * Upsert conflict key is (ats, external_job_id).
//   * `first_seen_at` and the enrichment columns are intentionally OMITTED from
//     the payload: DB defaults fill them on insert, and they're preserved on
//     update (PostgREST only updates columns present in the payload).
//   * Every seen job gets last_seen_at = the board's fetch time; a per-company stale-out then
//     flips is_active=false on rows whose last_seen_at predates this run.
//   * A company whose fetch throws is isolated (recorded in `errors`) and skips
//     stale-out, so a transient outage never deactivates its jobs.

import { supabaseAdmin } from "@/lib/supabase";
import { mapPool } from "@/lib/jobs/util";
import { fetchGreenhouseBoard } from "@/lib/jobs/sources/greenhouse";
import { fetchLeverBoard } from "@/lib/jobs/sources/lever";
import { fetchAshbyBoard } from "@/lib/jobs/sources/ashby";
import { fetchWorkdayBoard, fetchWorkdayBoardPaged } from "@/lib/jobs/sources/workday";
import { fetchOracleBoardPaged } from "@/lib/jobs/sources/oracle";
import { fetchSmartRecruitersBoardPaged } from "@/lib/jobs/sources/smartrecruiters";
import { fetchEightfoldBoardPaged } from "@/lib/jobs/sources/eightfold";
import { fetchIcimsBoardPaged } from "@/lib/jobs/sources/icims";
import { isLazyHydrated } from "@/lib/jobs/hydrate";
import type { Ats, BoardTarget, FetchResult, NormalizedJob } from "@/lib/jobs/types";

// A board fetch that may be deliberately partial (Workday caps at the newest
// N postings). `complete: false` changes how unseen rows are aged out.
export interface BoardFetchResult {
  jobs: NormalizedJob[];
  complete: boolean;
}

// How long a job from a PARTIAL board may go unseen before it's deactivated.
// A complete board deactivates unseen rows immediately; a capped one can't
// tell "closed" from "fell past the cap this run", so it waits.
const PARTIAL_STALE_MS = 7 * 86_400_000;

const CONCURRENCY = 5;

// Dispatch to the right adapter. Reused by the catalog validator (Module 2).
export async function fetchBoard(
  ats: Ats,
  slug: string,
  companyName?: string,
): Promise<NormalizedJob[]> {
  switch (ats) {
    case "greenhouse":
      return fetchGreenhouseBoard(slug, companyName);
    case "lever":
      return fetchLeverBoard(slug, companyName);
    case "ashby":
      return fetchAshbyBoard(slug, companyName);
    case "workday":
      return fetchWorkdayBoard(slug, companyName);
    case "oracle":
    case "smartrecruiters":
    case "eightfold":
    case "icims":
      return (await fetchBoardResult(ats, slug, companyName)).jobs;
    default:
      return [];
  }
}

// Workday and the enterprise boards (Oracle, SmartRecruiters, Eightfold,
// iCIMS) may be capped at their newest postings, so they report completeness.
export async function fetchBoardResult(ats: Ats, slug: string, companyName?: string): Promise<BoardFetchResult> {
  switch (ats) {
    case "workday":
      return fetchWorkdayBoardPaged(slug, companyName);
    case "oracle":
      return fetchOracleBoardPaged(slug, companyName);
    case "smartrecruiters":
      return fetchSmartRecruitersBoardPaged(slug, companyName);
    case "eightfold":
      return fetchEightfoldBoardPaged(slug, companyName);
    case "icims":
      return fetchIcimsBoardPaged(slug, companyName);
    default:
      return { jobs: await fetchBoard(ats, slug, companyName), complete: true };
  }
}

// A board that fails this many fetches in a row is deactivated (the company
// probably moved ATS); a universe employer is sent back to the resolver.
const MAX_CONSECUTIVE_FAILURES = 5;
const PAGE = 1000; // PostgREST max rows per request
const ID_CHUNK = 150; // ids per `in.(…)` filter, to keep request URLs short

// Every external_job_id we hold for a company, paged past the 1k row cap (a
// large board accumulates thousands of historical rows).
async function existingJobIds(sb: ReturnType<typeof supabaseAdmin>, companyId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("jobs")
      .select("external_job_id")
      .eq("company_id", companyId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`load existing jobs failed: ${error.message}`);
    for (const r of data ?? []) ids.add(r.external_job_id as string);
    if (!data || data.length < PAGE) return ids;
  }
}

export interface FetchOptions {
  // Scope to a subset of the catalog (the on-demand per-user refresh). An
  // empty array is a no-op.
  companyIds?: string[];
  // Only boards not fetched since this ISO time; most-stale first.
  staleBefore?: string;
  // Max boards to attempt this call.
  limit?: number;
  // Epoch ms: stop starting new boards past this (in-flight ones finish), so a
  // cron tick fits its function budget; the rest wait for the next tick.
  deadline?: number;
}

// Fetch, normalize and upsert boards. With no options this walks the whole
// active catalog; the jobs-fetch cron instead drains it in stale-first,
// time-budgeted slices (see src/app/api/cron/jobs-fetch).
export async function fetchAllListings(opts?: FetchOptions): Promise<FetchResult> {
  const sb = supabaseAdmin();

  const scope = opts?.companyIds;
  if (scope && scope.length === 0) {
    return { inserted: 0, updated: 0, newJobIds: [], errors: [], attempted: 0, skipped: 0 };
  }

  // Scoped ids go in the URL (`in.(…)`), so query them in chunks; merge and
  // re-sort most-stale first before applying the limit.
  const loadSlice = async (ids?: string[]) => {
    let q = sb
      .from("companies")
      .select("id, name, ats, slug, universe_id, fetch_failures, last_fetched_at")
      .eq("active", true);
    if (ids) q = q.in("id", ids);
    if (opts?.staleBefore) q = q.or(`last_fetched_at.is.null,last_fetched_at.lt.${opts.staleBefore}`);
    q = q.order("last_fetched_at", { ascending: true, nullsFirst: true });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(`load companies failed: ${error.message}`);
    return data ?? [];
  };
  let companies: Array<Record<string, unknown>>;
  if (scope) {
    const slices: string[][] = [];
    for (let i = 0; i < scope.length; i += ID_CHUNK) slices.push(scope.slice(i, i + ID_CHUNK));
    companies = (await Promise.all(slices.map(loadSlice)))
      .flat()
      .sort((a, b) => String(a.last_fetched_at ?? "").localeCompare(String(b.last_fetched_at ?? "")));
    if (opts?.limit) companies = companies.slice(0, opts.limit);
  } else {
    companies = await loadSlice();
  }

  const targets: Array<BoardTarget & { universe_id: string | null; fetch_failures: number }> = (companies ?? []).map(
    (c) => ({
      company_id: c.id as string,
      name: c.name as string,
      ats: c.ats as Ats,
      slug: c.slug as string,
      universe_id: (c.universe_id as string | null) ?? null,
      fetch_failures: (c.fetch_failures as number | null) ?? 0,
    }),
  );

  const result: FetchResult = { inserted: 0, updated: 0, newJobIds: [], errors: [], attempted: 0, skipped: 0 };

  await mapPool(targets, CONCURRENCY, async (t) => {
    if (opts?.deadline && Date.now() > opts.deadline) {
      result.skipped = (result.skipped ?? 0) + 1;
      return;
    }
    // Claim the board: two runs (the daily scan's top-up and a jobs-fetch
    // tick) fetching it concurrently could rewind last_seen_at and let one
    // run's stale-out deactivate the other's fresh jobs. Stamping
    // last_fetched_at first makes the second run see it as fresh and skip.
    if (opts?.staleBefore) {
      const { data: won } = await sb
        .from("companies")
        .update({ last_fetched_at: new Date().toISOString() })
        .eq("id", t.company_id)
        .or(`last_fetched_at.is.null,last_fetched_at.lt.${opts.staleBefore}`)
        .select("id");
      if (!won?.length) {
        result.skipped = (result.skipped ?? 0) + 1;
        return;
      }
    }
    result.attempted = (result.attempted ?? 0) + 1;
    // Per-board timestamp: last_seen_at and the stale-out compare against the
    // moment THIS board was fetched, not the start of a long run.
    const runTs = new Date().toISOString();
    try {
      const { jobs: normalized, complete } = await fetchBoardResult(t.ats, t.slug, t.name);

      // Pre-existing ids for this company -> accurate new-vs-seen classification.
      const existing = await existingJobIds(sb, t.company_id);

      if (normalized.length) {
        const rows = normalized.map((n) => {
          const base = {
            company_id: t.company_id,
            ats: n.ats,
            external_job_id: n.external_job_id,
            title: n.title,
            company: n.company,
            compensation: n.compensation,
            url: n.url,
            source: n.ats,
            last_seen_at: runTs,
            is_active: true,
            updated_at: runTs,
          };
          // A lazily-hydrated row we already have (Workday, Oracle, …) may
          // carry its JD, real start date and full locations (hydrate.ts);
          // the listing only has a summary, so refreshing must not overwrite
          // those columns.
          if (isLazyHydrated(n.ats) && existing.has(n.external_job_id)) return base;
          return {
            ...base,
            location_raw: n.location_raw,
            city: n.city,
            region: n.region,
            country: n.country,
            remote_type: n.remote_type,
            posted_date: n.posted_date,
            posted_date_approx: n.posted_date_approx,
            raw_json: n.raw_json,
          };
        });

        // Upsert full and summary-only rows separately: a bulk upsert NULLs
        // any column a row omits (supabase-js defaultToNull), which would wipe
        // the hydrated columns the summary rows deliberately leave out.
        const full = rows.filter((r) => "raw_json" in r);
        const summary = rows.filter((r) => !("raw_json" in r));
        const upserted: Array<{ id: unknown; external_job_id: unknown }> = [];
        for (const batch of [full, summary]) {
          if (!batch.length) continue;
          const { data, error: upErr } = await sb
            .from("jobs")
            .upsert(batch, { onConflict: "ats,external_job_id" })
            .select("id, external_job_id");
          if (upErr) throw new Error(upErr.message);
          upserted.push(...(data ?? []));
        }

        for (const r of upserted) {
          if (existing.has(r.external_job_id as string)) {
            result.updated++;
          } else {
            result.inserted++;
            result.newJobIds.push(r.id as string);
          }
        }
      }

      // Stale-out: still-active jobs for this company we didn't see this run
      // (partial boards: unseen for PARTIAL_STALE_MS).
      const staleBefore = complete ? runTs : new Date(Date.parse(runTs) - PARTIAL_STALE_MS).toISOString();
      await sb
        .from("jobs")
        .update({ is_active: false, updated_at: runTs })
        .eq("company_id", t.company_id)
        .eq("is_active", true)
        .lt("last_seen_at", staleBefore);

      await sb
        .from("companies")
        .update({ last_fetched_at: new Date().toISOString(), fetch_error: null, fetch_failures: 0 })
        .eq("id", t.company_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ company: t.name, ats: t.ats, slug: t.slug, error: message });
      await recordFailure(sb, t, message).catch(() => undefined);
    }
  });

  return result;
}

// Stamp the failure (last_fetched_at too, so a dead board doesn't hog the
// stale-first queue). Past MAX_CONSECUTIVE_FAILURES the board is deactivated —
// its jobs age out through normal stale-out — and a universe employer goes
// back to the resolver to find where it moved.
async function recordFailure(
  sb: ReturnType<typeof supabaseAdmin>,
  t: { company_id: string; universe_id: string | null; fetch_failures: number },
  message: string,
) {
  const failures = t.fetch_failures + 1;
  const dead = failures >= MAX_CONSECUTIVE_FAILURES;
  const nowIso = new Date().toISOString();
  await sb
    .from("companies")
    .update({
      last_fetched_at: nowIso,
      fetch_error: message.slice(0, 500),
      fetch_failures: failures,
      ...(dead ? { active: false } : {}),
    })
    .eq("id", t.company_id);
  if (dead) {
    await sb.from("jobs").update({ is_active: false, updated_at: nowIso }).eq("company_id", t.company_id).eq("is_active", true);
    if (t.universe_id) {
      await sb
        .from("company_universe")
        .update({
          resolve_status: "pending",
          resolve_attempts: 0,
          probed_at: null,
          next_resolve_at: null,
          resolve_note: `board went dead after ${failures} failed fetches: ${message.slice(0, 200)}`,
          updated_at: nowIso,
        })
        .eq("id", t.universe_id);
    }
  }
}
