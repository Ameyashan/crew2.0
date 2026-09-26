import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runAsSystem } from "@/lib/user-context";
import { systemBudgetStatus } from "@/lib/llm-budget";
import { fetchAllListings } from "@/lib/jobs/orchestrator";
import { enrichJobs } from "@/lib/jobs/enrich";
import { selectAll } from "@/lib/jobs/paging";
import { resolveUniverseBatch } from "@/lib/jobs/universe/resolve";
import { refineUniverseSectors } from "@/lib/jobs/universe/sectors";
import { matchCompaniesToH1b, applyTrackRecordToJobs } from "@/lib/jobs/h1b/match";

export const runtime = "nodejs";
export const maxDuration = 300;

// The catalog-maintenance tick (every 10 min, see vercel.json). With ~1k
// boards — many of them Workday boards that page 20 postings at a time — the
// catalog can't be fetched in one request, so each tick works through a
// time-budgeted slice, in priority order:
//
//   0. tracked — boards some user tracks (followed_companies), refreshed every
//               TRACKED_INTERVAL so the tracker's "last 24h" list is timely.
//   1. fetch  — boards not refreshed in FETCH_INTERVAL, most-stale first.
//               ~150 boards/tick × 144 ticks/day ≫ the catalog, so every
//               board is refreshed about once per FETCH_INTERVAL.
//   2. resolve — company-universe rows without a verified board yet (slug
//               probe → LLM guesses → careers page); then match newly linked
//               companies to USCIS H-1B records.
//   3. sectors — one LLM batch tagging universe employers with interest
//               sectors, until all are tagged.
//   4. enrich — drain the unenriched backlog, newest first, with whatever
//               time is left. Free signals only (size, USCIS track record):
//               the LLM JD visa parse runs on demand for scoring candidates,
//               never across the whole catalog.
//
// No per-user scoring runs here: the Jobs tracker matches titles in code, and
// the AI-ranked Recommended tab scores only on its user's explicit Refresh.
//
// Every phase is idempotent and bounded, so an overlapping or failed tick is
// harmless: the next one picks up where the queue stands. The LLM phases
// (resolve, sectors, H-1B match) stop at the daily system budget
// (src/lib/llm-budget.ts) and resume the next UTC day.

const FETCH_INTERVAL_MS = 20 * 3_600_000;
const TRACKED_INTERVAL_MS = 3 * 3_600_000;
const TRACKED_BUDGET_MS = 40_000;
const FETCH_BUDGET_MS = 140_000;
const RESOLVE_UNTIL_MS = 190_000;
const SECTORS_UNTIL_MS = 210_000;
const ENRICH_UNTIL_MS = 250_000; // a 40-job round with Workday hydration can take ~30s
const RESOLVE_BATCH = 25;
const ENRICH_BATCH = 40;

async function tick() {
  const started = Date.now();
  const at = (ms: number) => started + ms;
  const out: Record<string, unknown> = {};
  const safe = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };

  await safe("tracked", async () => {
    const sb = supabaseAdmin();
    const rows = await selectAll<{ company_id: string }>((from, to) =>
      sb.from("followed_companies").select("company_id").order("company_id").range(from, to),
    );
    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    if (!companyIds.length) return { attempted: 0 };
    const r = await fetchAllListings({
      companyIds,
      staleBefore: new Date(started - TRACKED_INTERVAL_MS).toISOString(),
      deadline: at(TRACKED_BUDGET_MS),
    });
    return { tracked: companyIds.length, attempted: r.attempted, skipped: r.skipped, inserted: r.inserted, errors: r.errors.length };
  });

  await safe("fetch", async () => {
    const r = await fetchAllListings({
      staleBefore: new Date(started - FETCH_INTERVAL_MS).toISOString(),
      deadline: at(FETCH_BUDGET_MS),
      limit: 400,
    });
    return { attempted: r.attempted, skipped: r.skipped, inserted: r.inserted, updated: r.updated, errors: r.errors.length };
  });

  if (Date.now() < at(RESOLVE_UNTIL_MS)) {
    await safe("resolve", async () => {
      const r = await resolveUniverseBatch({ limit: RESOLVE_BATCH, deadline: at(RESOLVE_UNTIL_MS) });
      // Newly linked boards: match them to USCIS records (the list's own
      // petitioning entities first) and push evidence onto their jobs.
      if (r.resolved > 0) {
        const matched = await matchCompaniesToH1b({ onlyUnmatched: true });
        const applied = await applyTrackRecordToJobs();
        return { ...r, h1b: { matched, applied } };
      }
      return r;
    });
  }

  if (Date.now() < at(SECTORS_UNTIL_MS)) await safe("sectors", () => refineUniverseSectors());

  await safe("enrich", async () => {
    let enriched = 0;
    let rounds = 0;
    while (Date.now() < at(ENRICH_UNTIL_MS)) {
      const r = await enrichJobs({ limit: ENRICH_BATCH, jdVisa: false });
      rounds++;
      enriched += r.enriched;
      if (r.enriched < ENRICH_BATCH) break; // backlog drained (or a batch failed)
    }
    return { enriched, rounds };
  });

  // Queue depths, so the response doubles as a progress report.
  await safe("queues", async () => {
    const sb = supabaseAdmin();
    const staleBefore = new Date(Date.now() - FETCH_INTERVAL_MS).toISOString();
    const [stale, pending, unenriched] = await Promise.all([
      sb
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .or(`last_fetched_at.is.null,last_fetched_at.lt.${staleBefore}`),
      sb.from("company_universe").select("id", { count: "exact", head: true }).neq("resolve_status", "resolved"),
      sb.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).is("enriched_at", null),
    ]);
    return { stale_boards: stale.count, unresolved_universe: pending.count, unenriched_jobs: unenriched.count };
  });
  await safe("llm_budget", systemBudgetStatus);

  return { ok: true, elapsed_ms: Date.now() - started, ...out };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  // Fail CLOSED, mirroring run-worker.
  if (!expected) return Response.json({ error: "cron secret not configured" }, { status: 503 });
  if (auth !== `Bearer ${expected}` && req.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // System context: the LLM phases log (and are budgeted) as system spend.
  return runAsSystem(async () => Response.json(await tick()));
}
