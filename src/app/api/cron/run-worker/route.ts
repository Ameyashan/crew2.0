import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runPipeline } from "@/lib/runs/execute-apply";
import { runPersonPipeline } from "@/lib/runs/execute-person";
import { runResumePipeline } from "@/lib/runs/execute-resume";
import { makeDbSink } from "@/lib/runs/sink";

export const runtime = "nodejs";
export const maxDuration = 300;

// A durable run whose background continuation (next/server `after()`) died —
// a redeploy mid-run, or one that ran past the function's maxDuration — leaves
// its row stuck at 'in_flight'. `after()` alone can't cover those cases, so this
// worker is the durable backstop: it claims any in_flight run (compose_runs job
// OR person, and resume_generations) whose lease has gone stale and re-drives it
// to completion, writing the same steps/output the client observes. Runs every
// minute (see vercel.json).
//
// Liveness is the heartbeat: a live run refreshes heartbeat_at on every step
// (makeDbSink), so a fresh heartbeat means "someone is already driving this" and
// the worker skips it. The stale window is comfortably larger than any single
// agent step so the worker never races a run that's merely slow.
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const BATCH = 3; // re-drive at most a few per tick per table

type Claimed = { id: string; kind?: string };

// Atomically claim up to BATCH stale in_flight rows from `table`. Re-asserting
// the staleness in the claiming UPDATE's WHERE means only one worker tick wins a
// given row (a non-empty returning row = we own it).
async function claimStale(
  table: string,
  statusColumn: string,
  threshold: string,
  extraSelect = "",
): Promise<Claimed[]> {
  const sb = supabaseAdmin();
  const select = `id, heartbeat_at${extraSelect}`;
  const { data: candidates, error } = await sb
    .from(table)
    .select(select)
    .eq(statusColumn, "in_flight")
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${threshold}`)
    .order("heartbeat_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error || !candidates) return [];

  const claimed: Claimed[] = [];
  for (const c of candidates as unknown as Claimed[]) {
    const nowIso = new Date().toISOString();
    const { data: won } = await sb
      .from(table)
      .update({ locked_at: nowIso, heartbeat_at: nowIso })
      .eq("id", c.id)
      .eq(statusColumn, "in_flight")
      .or(`heartbeat_at.is.null,heartbeat_at.lt.${threshold}`)
      .select(select)
      .maybeSingle();
    const wonRow = won as unknown as Claimed | null;
    if (wonRow?.id) claimed.push(wonRow);
  }
  return claimed;
}

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

  const threshold = new Date(Date.now() - STALE_MS).toISOString();

  const composeClaimed = await claimStale("compose_runs", "outcome", threshold, ", kind");
  const resumeClaimed = await claimStale("resume_generations", "status", threshold);

  // Re-drive each claimed run. Each executor loads the row's payload + user
  // context itself and finalizes idempotently. Dispatch compose runs by kind.
  const jobs: Promise<void>[] = [];
  for (const r of composeClaimed) {
    const sink = makeDbSink({ table: "compose_runs", id: r.id, statusColumn: "outcome" });
    jobs.push(r.kind === "person" ? runPersonPipeline(r.id, sink) : runPipeline(r.id, sink));
  }
  for (const r of resumeClaimed) {
    jobs.push(runResumePipeline(r.id, makeDbSink({ table: "resume_generations", id: r.id, statusColumn: "status" })));
  }

  const results = await Promise.allSettled(jobs);
  return Response.json({
    compose_claimed: composeClaimed.length,
    resume_claimed: resumeClaimed.length,
    completed: results.filter((r) => r.status === "fulfilled").length,
  });
}
