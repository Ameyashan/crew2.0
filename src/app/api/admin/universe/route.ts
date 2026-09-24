import { NextRequest } from "next/server";
import { runWithUser } from "@/lib/user-context";
import { resolveUniverseBatch, universeStatus } from "@/lib/jobs/universe/resolve";
import { refineUniverseSectors } from "@/lib/jobs/universe/sectors";
import { matchCompaniesToH1b, applyTrackRecordToJobs } from "@/lib/jobs/h1b/match";

export const runtime = "nodejs";
export const maxDuration = 300;

// Operator entry point for the company universe (the curated employer list,
// see supabase/migrations/0026_company_universe.sql). Guarded by CRON_SECRET,
// same scheme as /api/admin/h1b-ingest. The jobs-fetch cron runs the same
// batches automatically; this is for draining faster or checking progress.
//
//   GET  → progress: universe rows by resolve_status:org_type, boards by ATS.
//   POST {"action":"resolve","limit"?:n,"use_llm"?:bool}
//        → one bounded resolver batch (slug probe → LLM guesses → careers-page
//          sniff). Repeat until `considered` hits 0.
//   POST {"action":"sectors","limit"?:n} → one LLM sector-tagging batch.
//   POST {"action":"h1b"} → match newly linked companies to USCIS records
//          (listed petitioning entities first) and push evidence onto jobs.

function authed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return !!expected && (auth === `Bearer ${expected}` || req.headers.get("x-cron-secret") === expected);
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...(await universeStatus()) });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; limit?: unknown; use_llm?: unknown };
  const limit = typeof body.limit === "number" && body.limit > 0 ? Math.floor(body.limit) : undefined;

  return runWithUser(null, async () => {
    try {
      if (body.action === "resolve") {
        const resolved = await resolveUniverseBatch({
          limit,
          useLlm: body.use_llm !== false,
          deadline: Date.now() + 240_000,
        });
        return Response.json({ ok: true, resolved, ...(await universeStatus()) });
      }
      if (body.action === "sectors") {
        return Response.json({ ok: true, sectors: await refineUniverseSectors({ limit }) });
      }
      if (body.action === "h1b") {
        const matched = await matchCompaniesToH1b({ onlyUnmatched: true });
        const applied = await applyTrackRecordToJobs();
        return Response.json({ ok: true, matched, applied });
      }
      return Response.json({ ok: false, error: 'action must be "resolve" | "sectors" | "h1b"' }, { status: 400 });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}
