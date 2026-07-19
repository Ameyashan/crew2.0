import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runPipeline, makeDbSink } from "@/lib/runs/execute-apply";

export const runtime = "nodejs";
export const maxDuration = 300;

// A compose run whose background continuation (next/server `after()`) died —
// a redeploy mid-run, or a run that ran past the function's maxDuration — leaves
// its row stuck at outcome='in_flight'. `after()` alone can't cover those cases,
// so this worker is the durable backstop: it claims any in_flight run whose
// lease has gone stale and re-drives it to completion, writing the same
// steps/output the client observes. Runs every minute (see vercel.json).
//
// Liveness is the heartbeat: a live run refreshes heartbeat_at on every step
// (makeDbSink), so a fresh heartbeat means "someone is already driving this" and
// the worker skips it. The stale window is comfortably larger than any single
// agent step so the worker never races a run that's merely slow.
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const BATCH = 3; // re-drive at most a few per tick

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  // Fail CLOSED, mirroring the other cron routes.
  if (!expected) {
    return Response.json({ error: "cron secret not configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${expected}` && req.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const threshold = new Date(Date.now() - STALE_MS).toISOString();

  // Find candidate stale runs (oldest heartbeat first). A row with no heartbeat
  // at all also qualifies (defensive — inserts always set one).
  const { data: candidates, error } = await sb
    .from("compose_runs")
    .select("id, heartbeat_at")
    .eq("outcome", "in_flight")
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${threshold}`)
    .order("heartbeat_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const claimed: string[] = [];
  for (const c of candidates ?? []) {
    // Atomically claim: re-assert the staleness in the WHERE so only one worker
    // tick wins a given row. A non-empty returning row means we own it.
    const nowIso = new Date().toISOString();
    const { data: won } = await sb
      .from("compose_runs")
      .update({ locked_at: nowIso, heartbeat_at: nowIso })
      .eq("id", c.id)
      .eq("outcome", "in_flight")
      .or(`heartbeat_at.is.null,heartbeat_at.lt.${threshold}`)
      .select("id")
      .maybeSingle();
    if (won?.id) claimed.push(won.id as string);
  }

  // Re-drive each claimed run to completion. runPipeline loads the row's payload
  // + user context itself and finalizes idempotently.
  const results = await Promise.allSettled(
    claimed.map((id) => runPipeline(id, makeDbSink(id))),
  );

  return Response.json({
    scanned: candidates?.length ?? 0,
    claimed: claimed.length,
    completed: results.filter((r) => r.status === "fulfilled").length,
  });
}
