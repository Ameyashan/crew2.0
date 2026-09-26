import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { runAsSystem } from "@/lib/user-context";
import { systemBudgetExhausted } from "@/lib/llm-budget";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { strArray, extractPins } from "@/lib/jobs/scan";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;

// The daily scan: grow the catalog for users' sectors and pinned companies,
// then top up boards the continuous fetch (/api/cron/jobs-fetch, every 10 min)
// hasn't reached. It no longer scores anyone: the Jobs page is a company
// tracker matched by title in code (src/lib/jobs/tracker.ts), and the
// AI-ranked Recommended tab scores only when its user presses Refresh
// (src/lib/jobs/scan.ts runUserScan). Idempotent: upserts dedupe.

const COVERAGE_BUDGET_MS = 45_000;
const FETCH_BUDGET_MS = 60_000;
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
  const sb = supabaseAdmin();
  const onlyUser = opts.onlyUser;

  // 1. grow catalog for current demand (best-effort, bounded)
  let coverageAdded = 0;
  // Coverage growth is an LLM call; skipped once the daily system budget is
  // spent (a no-op in the dev per-user trigger, which isn't a system run).
  if (!(await systemBudgetExhausted())) {
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
  }

  // 2. top up boards the fetch cron hasn't reached (bounded)
  const fetched = await fetchAllListings({
    staleBefore: new Date(Date.now() - STALE_MS).toISOString(),
    deadline: Date.now() + FETCH_BUDGET_MS,
  }).catch((e) => {
    console.error("[jobs-scan] fetch failed", e);
    return null;
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
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authed = !!expected && (auth === `Bearer ${expected}` || req.headers.get("x-cron-secret") === expected);

  // System context so the coverage LLM calls log (and are budgeted) as system
  // spend.
  if (authed) return runAsSystem(() => runScan({}));

  // Dev-only manual trigger: scoped to the session user, gated behind an env
  // flag so it can never be invoked in production.
  if (process.env.ALLOW_MANUAL_JOBS_SCAN === "1") {
    return withUser((uid) => runScan({ onlyUser: uid }));
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}
