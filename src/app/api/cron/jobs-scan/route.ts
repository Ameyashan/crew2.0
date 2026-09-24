import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { scoreDueUsers, strArray, extractPins } from "@/lib/jobs/scan";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;

// The daily scan: grow catalog → catch up stale boards → per-user select +
// enrich + score. Board fetching, discovery and the global enrichment drain
// run continuously in /api/cron/jobs-fetch (every 10 min), so this run only
// tops up boards that tick hasn't reached and spends the rest of its budget on
// scoring — oldest-scanned users first, until the deadline; anyone left over
// is picked up by jobs-fetch ticks. Idempotent: upserts dedupe and scoring
// skips already-scored jobs. Selection/scoring is shared with the on-demand
// refresh (src/lib/jobs/scan.ts).

const COVERAGE_BUDGET_MS = 45_000;
const FETCH_BUDGET_MS = 60_000;
const SCORE_DEADLINE_MS = 270_000;
// Boards the fetch cron hasn't refreshed in this long get topped up here.
const STALE_MS = 20 * 3_600_000;

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
  const started = Date.now();
  const sb = supabaseAdmin();
  const onlyUser = opts.onlyUser;

  // 1. grow catalog for current demand (best-effort, bounded)
  let coverageAdded = 0;
  try {
    const demand = await gatherDemand(sb, onlyUser ? [onlyUser] : undefined);
    const cov = await Promise.race([
      ensureCatalogCoverage({
        sectors: demand.sectors,
        companyNames: demand.companies,
        maxValidate: onlyUser ? 12 : 40,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), COVERAGE_BUDGET_MS)),
    ]);
    coverageAdded = cov?.added.length ?? 0;
  } catch (e) {
    console.error("[jobs-scan] coverage failed", e);
  }

  // 2. top up boards the fetch cron hasn't reached (bounded)
  const fetched = await fetchAllListings({
    staleBefore: new Date(Date.now() - STALE_MS).toISOString(),
    deadline: Date.now() + FETCH_BUDGET_MS,
  }).catch((e) => {
    console.error("[jobs-scan] fetch failed", e);
    return null;
  });

  // 3. per-user select + enrich + score, oldest-scanned first, until the deadline
  const scoring = await scoreDueUsers({
    staleBefore: new Date(started).toISOString(),
    deadline: started + SCORE_DEADLINE_MS,
    onlyUser,
    runAs: (uid, fn) => runWithUser(uid, fn),
  });

  return Response.json({
    ok: true,
    coverage_added: coverageAdded,
    fetched: fetched && {
      attempted: fetched.attempted,
      inserted: fetched.inserted,
      updated: fetched.updated,
      errors: fetched.errors.length,
      skipped: fetched.skipped,
    },
    ...scoring,
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authed = !!expected && (auth === `Bearer ${expected}` || req.headers.get("x-cron-secret") === expected);

  // Anonymous context so the global fetch/enrich phases can reach logAgentRun
  // (it requires a user context to exist); per-user scoring re-wraps with the
  // real uid below.
  if (authed) return runWithUser(null, () => runScan({}));

  // Dev-only manual trigger: scoped to the session user, gated behind an env
  // flag so it can never be invoked in production.
  if (process.env.ALLOW_MANUAL_JOBS_SCAN === "1") {
    return withUser((uid) => runScan({ onlyUser: uid }));
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}
