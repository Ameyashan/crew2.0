import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Lightweight per-IP cap on signed-out ("blur-gate teaser") crew runs. A
// signed-out run executes real LLM + web-search work, so it's uncapped
// unauthenticated compute without this guard. We record one anon_run_events row
// per allowed anonymous run and refuse once an IP exceeds the window budget.
//
// Deliberately simple: no Redis/Upstash (none in the repo). Counting rows in a
// small service-role-only table is plenty for an abuse speed-bump, and it holds
// across serverless instances (unlike an in-memory counter).

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_RUNS_PER_WINDOW = 5;

// Best-effort client IP. Vercel/most proxies set x-forwarded-for as a
// comma-separated list with the client first; fall back to x-real-ip.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

// Returns a 429 Response if the caller's IP has exhausted its anonymous-run
// budget, otherwise records the run and returns null (allow). Fails OPEN on any
// Supabase error — the cap must never take down the happy path.
export async function assertAnonRunAllowed(
  req: NextRequest,
): Promise<Response | null> {
  const ipHash = hashIp(clientIp(req));
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  try {
    const { count, error } = await sb
      .from("anon_run_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (error) throw error;

    if ((count ?? 0) >= MAX_RUNS_PER_WINDOW) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }

    // Record this run. Non-fatal if it fails — better to under-count than to
    // block a legitimate visitor on a transient write error.
    const { error: insErr } = await sb
      .from("anon_run_events")
      .insert({ ip_hash: ipHash });
    if (insErr) console.error("[anon_run_events] insert failed", insErr);
  } catch (e) {
    console.error("[anon-rate-limit] check failed — allowing", e);
    return null;
  }

  return null;
}
