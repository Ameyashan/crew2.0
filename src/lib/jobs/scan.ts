// Shared scan helpers + the on-demand per-user pipeline.
//
// The daily cron (api/cron/jobs-scan) fetches + enriches the catalog GLOBALLY
// once, then scores per user. The "Refresh" button on the feed instead runs a
// bounded, single-user pass: grow the catalog for that user's interests, fetch
// listings for just their candidate companies, enrich, then select + score.
// Both paths share candidate selection so rankings stay consistent.
//
// runUserScan() calls scoreJobsForUser(), which reads currentUserId(); callers
// MUST run it inside runWithUser()/withUser().

import { supabaseAdmin } from "@/lib/supabase";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { enrichJobs } from "@/lib/jobs/enrich";
import { scoreJobsForUser } from "@/lib/jobs/score";
import type { Job } from "@/lib/db/schema";
import type { PostedWithin, SizeBucket, RoleMode } from "@/lib/jobs/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScanPrefs {
  interests: string[];
  posted_within: PostedWithin;
  company_sizes: SizeBucket[];
  locations: string[];
  role_mode: RoleMode;
  target_roles: string[];
}

const DEFAULT_PREFS: ScanPrefs = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
  role_mode: null,
  target_roles: [],
};

const ROLE_MODES: RoleMode[] = ["current", "different"];
export function coerceRoleMode(v: unknown): RoleMode {
  return ROLE_MODES.includes(v as RoleMode) ? (v as RoleMode) : null;
}

const POSTED: PostedWithin[] = ["24h", "1wk", "1mo", "any"];
const SIZES: SizeBucket[] = ["large", "medium", "startup"];

export function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

export function extractPins(cs: unknown): string[] {
  if (cs && typeof cs === "object" && Array.isArray((cs as Record<string, unknown>).target_companies)) {
    return strArray((cs as Record<string, unknown>).target_companies);
  }
  return [];
}

function postedThreshold(posted: PostedWithin): string | null {
  const day = 86_400_000;
  const now = Date.now();
  if (posted === "24h") return new Date(now - day).toISOString();
  if (posted === "1wk") return new Date(now - 7 * day).toISOString();
  if (posted === "1mo") return new Date(now - 30 * day).toISOString();
  return null;
}

const LOC_MATCHERS: Record<string, RegExp> = {
  nyc: /new york|nyc|manhattan|brooklyn|\bny\b/i,
  sf: /san francisco|bay area|oakland|palo alto|menlo|mountain view|\bsf\b/i,
  boston: /boston|cambridge|\bma\b/i,
  seattle: /seattle|bellevue|redmond|\bwa\b/i,
  la: /los angeles|santa monica|\bl\.?a\.?\b/i,
};

function matchesLocations(job: Job, locations: string[]): boolean {
  if (!locations.length || locations.includes("anywhere")) return true;
  const hay = [job.location_raw, job.city, job.region, job.country].filter(Boolean).join(" ");
  for (const loc of locations) {
    if (loc === "remote") {
      if (job.remote_type === "remote" || /remote/i.test(hay)) return true;
    } else if (LOC_MATCHERS[loc]?.test(hay)) {
      return true;
    }
  }
  return false;
}

// Lenient on company_size: unknown (unenriched) passes so we don't hide jobs the
// enrichment pass hasn't reached yet.
function matchesSize(job: Job, sizes: SizeBucket[]): boolean {
  if (!sizes.length) return true;
  if (!job.company_size) return true;
  return sizes.includes(job.company_size);
}

export async function loadScanPrefs(
  sb: SupabaseClient,
  uid: string,
): Promise<{ prefs: ScanPrefs; pins: string[] }> {
  const { data: row } = await sb.from("job_preferences").select("*").eq("user_id", uid).maybeSingle();
  const prefs: ScanPrefs = row
    ? {
        interests: strArray(row.interests),
        posted_within: POSTED.includes(row.posted_within) ? row.posted_within : "any",
        company_sizes: strArray(row.company_sizes).filter((s): s is SizeBucket => SIZES.includes(s as SizeBucket)),
        locations: strArray(row.locations),
        role_mode: coerceRoleMode(row.role_mode),
        target_roles: strArray(row.target_roles),
      }
    : { ...DEFAULT_PREFS };
  const { data: prof } = await sb.from("user_profile").select("context_structured").eq("user_id", uid).maybeSingle();
  return { prefs, pins: extractPins(prof?.context_structured) };
}

// The catalog companies that match a user's interests (sector overlap) or pins
// (exact normalized-name). Shared by the targeted fetch and candidate selection.
export async function resolveCompanyIds(
  sb: SupabaseClient,
  prefs: ScanPrefs,
  pins: string[],
): Promise<string[]> {
  const companyIds = new Set<string>();
  if (prefs.interests.length) {
    const { data } = await sb.from("companies").select("id").eq("active", true).overlaps("sectors", prefs.interests);
    for (const c of data ?? []) companyIds.add(c.id as string);
  }
  if (pins.length) {
    const norms = pins.map((p) => p.toLowerCase().trim());
    const { data } = await sb.from("companies").select("id").in("normalized", norms);
    for (const c of data ?? []) companyIds.add(c.id as string);
  }
  return [...companyIds];
}

export async function selectCandidateJobs(
  sb: SupabaseClient,
  prefs: ScanPrefs,
  pins: string[],
  companyIds?: string[],
): Promise<Job[]> {
  const ids = companyIds ?? (await resolveCompanyIds(sb, prefs, pins));
  if (!ids.length) return [];

  const threshold = postedThreshold(prefs.posted_within);
  let q = sb
    .from("jobs")
    .select("*")
    .in("company_id", ids)
    .eq("is_active", true)
    .order("posted_date", { ascending: false, nullsFirst: false })
    .limit(120);
  if (threshold) q = q.or(`posted_date.gte.${threshold},posted_date.is.null`);

  const { data: jobsData } = await q;
  const jobs = (jobsData ?? []) as Job[];
  return jobs.filter((j) => matchesLocations(j, prefs.locations) && matchesSize(j, prefs.company_sizes)).slice(0, 80);
}

export interface UserScanSummary {
  candidates: number;
  scored: number;
  skipped: number;
  reason?: "no_preferences" | "no_companies";
}

// On-demand per-user refresh: coverage -> targeted fetch -> enrich -> select +
// score. Bounded and best-effort; a hiccup in any growth step still lets us
// score whatever the catalog already holds. MUST run inside a user context.
export async function runUserScan(uid: string): Promise<UserScanSummary> {
  const sb = supabaseAdmin();
  const { prefs, pins } = await loadScanPrefs(sb, uid);
  if (!prefs.interests.length && !pins.length) {
    return { candidates: 0, scored: 0, skipped: 0, reason: "no_preferences" };
  }

  // Grow the catalog for this user's demand (best-effort).
  try {
    await ensureCatalogCoverage({ sectors: prefs.interests, companyNames: pins, addedBy: uid, maxValidate: 12 });
  } catch (e) {
    console.error("[jobs/refresh] coverage failed", e);
  }

  // Resolve AFTER coverage so newly-added companies are included.
  const companyIds = await resolveCompanyIds(sb, prefs, pins);
  if (!companyIds.length) return { candidates: 0, scored: 0, skipped: 0, reason: "no_companies" };

  // Fetch listings for just this user's companies, then enrich (both best-effort).
  try {
    await fetchAllListings({ companyIds });
  } catch (e) {
    console.error("[jobs/refresh] fetch failed", e);
  }
  try {
    await enrichJobs({ limit: 80 });
  } catch (e) {
    console.error("[jobs/refresh] enrich failed", e);
  }

  const candidates = await selectCandidateJobs(sb, prefs, pins, companyIds);
  if (!candidates.length) return { candidates: 0, scored: 0, skipped: 0 };

  const summary = await scoreJobsForUser({
    jobs: candidates,
    roleMode: prefs.role_mode,
    targetRoles: prefs.target_roles,
  });
  return { candidates: candidates.length, ...summary };
}
