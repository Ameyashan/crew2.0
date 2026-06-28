import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { enrichJobs } from "@/lib/jobs/enrich";
import { scoreJobsForUser } from "@/lib/jobs/score";
import { loadScanPrefs, selectCandidateJobs, strArray, extractPins } from "@/lib/jobs/scan";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;

// The daily scan: grow catalog -> fetch -> enrich (all global, once) -> per-user
// select + score. Mirrors src/app/api/cron/daily-digest/route.ts. Idempotent:
// every upsert dedupes and scoring skips already-scored jobs, so re-running the
// same day is safe and cheap. Candidate selection + scan-prefs loading are shared
// with the on-demand per-user refresh (see src/lib/jobs/scan.ts).

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
