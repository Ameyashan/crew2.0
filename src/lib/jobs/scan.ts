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
import { roleTitleTerms } from "@/lib/jobs/roles";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { enrichJobs } from "@/lib/jobs/enrich";
import { scoreJobsForUser } from "@/lib/jobs/score";
import type { Job } from "@/lib/db/schema";
import type { PostedWithin, SizeBucket, RoleMode, VisaConfidence } from "@/lib/jobs/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScanPrefs {
  interests: string[];
  posted_within: PostedWithin;
  company_sizes: SizeBucket[];
  locations: string[];
  visa_required: boolean;
  role_mode: RoleMode;
  target_roles: string[];
  include_universe: boolean;
  include_staffing: boolean;
}

const DEFAULT_PREFS: ScanPrefs = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
  visa_required: false,
  role_mode: null,
  target_roles: [],
  include_universe: true,
  include_staffing: false,
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

// The profile's current role, used as the title signal when the user hasn't
// asked for a different role (mirrors the scorer's resolveTargetRoleLine).
export function extractCurrentRole(cs: unknown): string | null {
  if (cs && typeof cs === "object" && typeof (cs as Record<string, unknown>).current_role === "string") {
    const v = ((cs as Record<string, unknown>).current_role as string).trim();
    return v || null;
  }
  return null;
}

export function postedThreshold(posted: PostedWithin): string | null {
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

// Structural subset of a jobs row the preference matchers need, so both full
// `Job` rows (scan time) and the feed's joined rows (read time) qualify.
export interface LocatableJob {
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote_type: string;
}

export function matchesLocations(job: LocatableJob, locations: string[]): boolean {
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
export function matchesSize(job: { company_size: SizeBucket | null }, sizes: SizeBucket[]): boolean {
  if (!sizes.length) return true;
  if (!job.company_size) return true;
  return sizes.includes(job.company_size);
}

// A user who needs sponsorship never sees a job whose JD explicitly rules it
// out — that's the whole point of the signal (killing wasted applications).
// Everyone else still sees it, with the red NO SPONSORSHIP chip. Only the
// explicit 'no_sponsorship' verdict hides; 'unclear'/null always pass.
export function matchesVisaNeed(
  job: { visa_confidence: VisaConfidence | null },
  visaRequired: boolean,
): boolean {
  return !(visaRequired && job.visa_confidence === "no_sponsorship");
}

// Staffing firms (company_universe org_type 'staffing') stay out of the feed
// and the email unless the user opted in or explicitly follows the company.
// Read-time twin of the scan-time exclusion in resolveCompanyIds, so matches
// scored before the user turned them off disappear too.
export function matchesStaffingPref(
  job: { company_id: string | null; companies?: { org_type: string | null } | null },
  includeStaffing: boolean,
  followed: ReadonlySet<string>,
): boolean {
  if (includeStaffing || job.companies?.org_type !== "staffing") return true;
  return !!job.company_id && followed.has(job.company_id);
}

// Followed company_ids for a user (catalog ids, already resolved — no name
// lookup needed). Separate helper so the feed route and scan can both reuse it.
export async function loadFollowedCompanyIds(sb: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await sb.from("followed_companies").select("company_id").eq("user_id", uid);
  return (data ?? []).map((r) => r.company_id as string);
}

export async function loadScanPrefs(
  sb: SupabaseClient,
  uid: string,
): Promise<{ prefs: ScanPrefs; pins: string[]; follows: string[]; currentRole: string | null }> {
  const { data: row } = await sb.from("job_preferences").select("*").eq("user_id", uid).maybeSingle();
  const prefs: ScanPrefs = row
    ? {
        interests: strArray(row.interests),
        posted_within: POSTED.includes(row.posted_within) ? row.posted_within : "any",
        company_sizes: strArray(row.company_sizes).filter((s): s is SizeBucket => SIZES.includes(s as SizeBucket)),
        locations: strArray(row.locations),
        visa_required: row.visa_required === true,
        role_mode: coerceRoleMode(row.role_mode),
        target_roles: strArray(row.target_roles),
        include_universe: row.include_universe !== false,
        include_staffing: row.include_staffing === true,
      }
    : { ...DEFAULT_PREFS };
  const { data: prof } = await sb.from("user_profile").select("context_structured").eq("user_id", uid).maybeSingle();
  const follows = await loadFollowedCompanyIds(sb, uid);
  return {
    prefs,
    pins: extractPins(prof?.context_structured),
    follows,
    currentRole: extractCurrentRole(prof?.context_structured),
  };
}

// The catalog companies that match a user's interests (sector overlap), pins
// (exact normalized-name), or explicit follows (catalog ids). Shared by the
// targeted fetch and candidate selection. Follows are unioned in verbatim so a
// company the user follows keeps being scanned even when it's outside their
// sectors — that's the whole point of following.
export async function resolveCompanyIds(
  sb: SupabaseClient,
  prefs: ScanPrefs,
  pins: string[],
  follows: string[] = [],
): Promise<string[]> {
  const companyIds = new Set<string>(follows);
  if (prefs.interests.length) {
    // Staffing firms only enter through sectors on explicit opt-in; a pin or
    // follow (below / above) is explicit intent and always counts.
    let q = sb.from("companies").select("id").eq("active", true).overlaps("sectors", prefs.interests);
    if (!prefs.include_staffing) q = q.neq("org_type", "staffing");
    const { data } = await q;
    for (const c of data ?? []) companyIds.add(c.id as string);
  }
  if (pins.length) {
    const norms = pins.map((p) => p.toLowerCase().trim());
    const { data } = await sb.from("companies").select("id").in("normalized", norms);
    for (const c of data ?? []) companyIds.add(c.id as string);
  }
  return [...companyIds];
}

// A single prolific company (a Databricks-sized board posts hundreds of roles)
// must not consume the whole scoring budget: cap how many of its listings can
// enter one scan so the candidate set — and therefore the feed — stays varied.
const MAX_CANDIDATES_PER_COMPANY = 10;
const MAX_CANDIDATES = 80;
// How many title-matching jobs the role-priority query may pull. Separate from
// the recency window's 300 because these rows skip the recency competition.
const ROLE_PRIORITY_LIMIT = 100;
// Title-matching jobs pulled from the curated company universe (0026).
const UNIVERSE_ROLE_LIMIT = 150;
// company_id lists are sent in the URL (PostgREST `in.(…)`); interest sectors
// now span hundreds of universe companies, so query in chunks to stay well
// under proxy URL limits (~37 chars per uuid).
const ID_CHUNK = 150;

const byRecency = (a: Job, b: Job) => (b.posted_date ?? "").localeCompare(a.posted_date ?? "");

// Active jobs at `ids`, optionally title-filtered, newest first, across ID
// chunks queried in parallel.
async function jobsAtCompanies(
  sb: SupabaseClient,
  ids: string[],
  roleTerms: string[] | null,
  limit: number,
): Promise<Job[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) => {
      let q = sb.from("jobs").select("*").in("company_id", chunk).eq("is_active", true);
      if (roleTerms) q = q.or(roleTerms.map((t) => `title.ilike.%${t}%`).join(","));
      return q.order("posted_date", { ascending: false, nullsFirst: false }).limit(limit);
    }),
  );
  const rows = results.flatMap((r) => (r.data ?? []) as Job[]);
  return chunks.length > 1 ? rows.sort(byRecency).slice(0, limit) : rows;
}

// Title-matching jobs at ANY curated-universe employer (Fortune 500, top
// startups, top H-1B sponsors) — what lets a user find "software engineer"
// roles across ~1k employers without picking a sector for each. Staffing firms
// stay out unless the user opted in.
async function universeRoleJobs(
  sb: SupabaseClient,
  roleTerms: string[],
  includeStaffing: boolean,
  limit: number,
): Promise<Job[]> {
  if (!roleTerms.length) return [];
  let q = sb
    .from("jobs")
    .select("*, companies!inner(universe_id, org_type)")
    .eq("is_active", true)
    .not("companies.universe_id", "is", null)
    .or(roleTerms.map((t) => `title.ilike.%${t}%`).join(","));
  if (!includeStaffing) q = q.neq("companies.org_type", "staffing");
  const { data } = await q.order("posted_date", { ascending: false, nullsFirst: false }).limit(limit);
  return ((data ?? []) as Array<Job & { companies?: unknown }>).map((row) => {
    const job = { ...row };
    delete job.companies;
    return job as Job;
  });
}

// Does this user give the scan anything to go on? Sectors, pins and follows
// name companies; with the universe on, a target title alone is enough.
export function hasScanSignal(
  prefs: ScanPrefs,
  pins: string[],
  follows: string[],
  currentRole: string | null,
): boolean {
  if (prefs.interests.length || pins.length || follows.length) return true;
  return prefs.include_universe && roleTitleTerms(prefs.role_mode, prefs.target_roles, currentRole).length > 0;
}

export async function selectCandidateJobs(
  sb: SupabaseClient,
  prefs: ScanPrefs,
  pins: string[],
  companyIds?: string[],
  follows: string[] = [],
  currentRole: string | null = null,
): Promise<Job[]> {
  const ids = companyIds ?? (await resolveCompanyIds(sb, prefs, pins, follows));
  // Recency alone starves a role-specific user: a big catalog's newest 300
  // jobs can hold zero listings in their target family, so those never even
  // reach the scorer and the feed's fit bar hides everything else. Pull
  // title-matching jobs in separate queries and put them FIRST, so they can't
  // be squeezed out by the recency pool or the overall candidate cap.
  const roleTerms = roleTitleTerms(prefs.role_mode, prefs.target_roles, currentRole);
  const useUniverse = prefs.include_universe && roleTerms.length > 0;
  if (!ids.length && !useUniverse) return [];

  // posted_within is deliberately NOT applied here. It's a display filter,
  // enforced at read time (feed + email digest). Filtering the candidate pool
  // by it would empty the pipeline for users with a tight setting ("24h" in a
  // catalog of mostly older listings scores nothing, forever), and scores
  // persist — so a job scored today is still ready if they loosen the filter.
  const [recent, priority, universe] = await Promise.all([
    jobsAtCompanies(sb, ids, null, 300),
    roleTerms.length ? jobsAtCompanies(sb, ids, roleTerms, ROLE_PRIORITY_LIMIT) : Promise.resolve([] as Job[]),
    useUniverse
      ? universeRoleJobs(sb, roleTerms, prefs.include_staffing, UNIVERSE_ROLE_LIMIT)
      : Promise.resolve([] as Job[]),
  ]);

  // Order: title matches at the user's own companies, then title matches
  // across the universe, then the recency pool.
  const seen = new Set<string>();
  const jobs: Job[] = [];
  for (const j of [...priority, ...universe, ...recent]) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    jobs.push(j);
  }
  const matching = jobs.filter(
    (j) =>
      matchesLocations(j, prefs.locations) &&
      matchesSize(j, prefs.company_sizes) &&
      matchesVisaNeed(j, prefs.visa_required),
  );

  const perCompany = new Map<string, number>();
  const picked: Job[] = [];
  for (const j of matching) {
    if (picked.length >= MAX_CANDIDATES) break;
    const key = j.company_id ?? j.company;
    const n = perCompany.get(key) ?? 0;
    if (n >= MAX_CANDIDATES_PER_COMPANY) continue;
    perCompany.set(key, n + 1);
    picked.push(j);
  }
  return picked;
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
  const { prefs, pins, follows, currentRole } = await loadScanPrefs(sb, uid);
  if (!hasScanSignal(prefs, pins, follows, currentRole)) {
    return { candidates: 0, scored: 0, skipped: 0, reason: "no_preferences" };
  }

  // Grow the catalog for this user's demand (best-effort).
  try {
    await ensureCatalogCoverage({ sectors: prefs.interests, companyNames: pins, addedBy: uid, maxValidate: 12 });
  } catch (e) {
    console.error("[jobs/refresh] coverage failed", e);
  }

  // Resolve AFTER coverage so newly-added companies are included. With the
  // universe on, a title alone can find candidates, so no companies is fine.
  const companyIds = await resolveCompanyIds(sb, prefs, pins, follows);
  const titleOnly = prefs.include_universe && roleTitleTerms(prefs.role_mode, prefs.target_roles, currentRole).length > 0;
  if (!companyIds.length && !titleOnly) {
    return { candidates: 0, scored: 0, skipped: 0, reason: "no_companies" };
  }

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

  const candidates = await selectCandidateJobs(sb, prefs, pins, companyIds, follows, currentRole);
  if (!candidates.length) return { candidates: 0, scored: 0, skipped: 0 };

  const summary = await scoreJobsForUser({
    jobs: candidates,
    roleMode: prefs.role_mode,
    targetRoles: prefs.target_roles,
    visaRequired: prefs.visa_required,
  });
  return { candidates: candidates.length, ...summary };
}
