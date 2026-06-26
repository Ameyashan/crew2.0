import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { enrichJobs } from "@/lib/jobs/enrich";
import { scoreJobsForUser } from "@/lib/jobs/score";
import type { Job } from "@/lib/db/schema";
import type { PostedWithin, SizeBucket } from "@/lib/jobs/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;

// The daily scan: grow catalog -> fetch -> enrich (all global, once) -> per-user
// select + score. Mirrors src/app/api/cron/daily-digest/route.ts. Idempotent:
// every upsert dedupes and scoring skips already-scored jobs, so re-running the
// same day is safe and cheap.

interface ScanPrefs {
  interests: string[];
  posted_within: PostedWithin;
  company_sizes: SizeBucket[];
  locations: string[];
}

const DEFAULT_PREFS: ScanPrefs = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function extractPins(cs: unknown): string[] {
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

async function selectCandidateJobs(sb: SupabaseClient, prefs: ScanPrefs, pins: string[]): Promise<Job[]> {
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
  if (!companyIds.size) return [];

  const threshold = postedThreshold(prefs.posted_within);
  let q = sb
    .from("jobs")
    .select("*")
    .in("company_id", [...companyIds])
    .eq("is_active", true)
    .order("posted_date", { ascending: false, nullsFirst: false })
    .limit(120);
  if (threshold) q = q.or(`posted_date.gte.${threshold},posted_date.is.null`);

  const { data: jobsData } = await q;
  const jobs = (jobsData ?? []) as Job[];
  return jobs.filter((j) => matchesLocations(j, prefs.locations) && matchesSize(j, prefs.company_sizes)).slice(0, 80);
}

async function loadScanPrefs(sb: SupabaseClient, uid: string): Promise<{ prefs: ScanPrefs; pins: string[] }> {
  const { data: row } = await sb.from("job_preferences").select("*").eq("user_id", uid).maybeSingle();
  const prefs: ScanPrefs = row
    ? {
        interests: strArray(row.interests),
        posted_within: (["24h", "1wk", "1mo", "any"] as PostedWithin[]).includes(row.posted_within)
          ? row.posted_within
          : "any",
        company_sizes: strArray(row.company_sizes).filter((s): s is SizeBucket =>
          (["large", "medium", "startup"] as SizeBucket[]).includes(s as SizeBucket),
        ),
        locations: strArray(row.locations),
      }
    : { ...DEFAULT_PREFS };
  const { data: prof } = await sb.from("user_profile").select("context_structured").eq("user_id", uid).maybeSingle();
  return { prefs, pins: extractPins(prof?.context_structured) };
}

async function scoreUserScan(sb: SupabaseClient, uid: string) {
  const { prefs, pins } = await loadScanPrefs(sb, uid);
  if (!prefs.interests.length && !pins.length) return { candidates: 0, scored: 0, skipped: 0 };
  const candidates = await selectCandidateJobs(sb, prefs, pins);
  if (!candidates.length) return { candidates: 0, scored: 0, skipped: 0 };
  const summary = await scoreJobsForUser({ jobs: candidates });
  return { candidates: candidates.length, ...summary };
}

async function gatherDemand(sb: SupabaseClient, userIds?: string[]) {
  const sectors = new Set<string>();
  const companies = new Set<string>();

  let prefsQ = sb.from("job_preferences").select("user_id, interests");
  if (userIds) prefsQ = prefsQ.in("user_id", userIds);
  const { data: prefs } = await prefsQ;
  for (const r of prefs ?? []) for (const s of strArray(r.interests)) sectors.add(s);

  let profQ = sb.from("user_profile").select("user_id, context_structured").not("onboarded_at", "is", null);
  if (userIds) profQ = profQ.in("user_id", userIds);
  const { data: profs } = await profQ;
  for (const r of profs ?? []) for (const c of extractPins(r.context_structured)) companies.add(c);

  return { sectors: [...sectors], companies: [...companies] };
}

async function runScan(opts: { onlyUser?: string }): Promise<Response> {
  const sb = supabaseAdmin();
  const onlyUser = opts.onlyUser;

  // 1. grow catalog for current demand (best-effort)
  let coverageAdded = 0;
  try {
    const demand = await gatherDemand(sb, onlyUser ? [onlyUser] : undefined);
    const cov = await ensureCatalogCoverage({
      sectors: demand.sectors,
      companyNames: demand.companies,
      maxValidate: onlyUser ? 12 : 40,
    });
    coverageAdded = cov.added.length;
  } catch (e) {
    console.error("[jobs-scan] coverage failed", e);
  }

  // 2. fetch + 3. enrich (global, once)
  const fetched = await fetchAllListings();
  const enriched = await enrichJobs({ limit: 80 });

  // 4. per-user select + score
  let users: string[];
  if (onlyUser) {
    users = [onlyUser];
  } else {
    const { data } = await sb.from("user_profile").select("user_id").not("onboarded_at", "is", null);
    users = (data ?? []).map((r) => r.user_id as string);
  }

  const per_user: Array<Record<string, unknown>> = [];
  for (const uid of users) {
    try {
      const summary = await runWithUser(uid, () => scoreUserScan(sb, uid));
      per_user.push({ user_id: uid, ...summary });
    } catch (e) {
      per_user.push({ user_id: uid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({
    ok: true,
    coverage_added: coverageAdded,
    fetched: { inserted: fetched.inserted, updated: fetched.updated, errors: fetched.errors.length },
    enriched,
    per_user,
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authed = !!expected && (auth === `Bearer ${expected}` || req.headers.get("x-cron-secret") === expected);

  if (authed) return runScan({});

  // Dev-only manual trigger: scoped to the session user, gated behind an env
  // flag so it can never be invoked in production.
  if (process.env.ALLOW_MANUAL_JOBS_SCAN === "1") {
    return withUser((uid) => runScan({ onlyUser: uid }));
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}
