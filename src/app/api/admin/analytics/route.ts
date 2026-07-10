import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Read-only analytics summary for the cofounder-analytics agent (and a future
// admin dashboard). Guarded by a shared Bearer secret rather than a user
// session, so a HEADLESS scheduled Claude Code session can read it without an
// interactive OAuth flow (the Supabase MCP may be unavailable in cron runs).
//
// FAIL CLOSED: if ADMIN_ANALYTICS_SECRET is not set, the endpoint is disabled
// (503) rather than open. This is the opposite of the app's older
// `if (expected && ...)` cron guards — see docs/cofounder for the follow-up to
// harden those the same way.
//
// Returns pre-aggregated JSON only (counts, funnels) — never raw PII.

function authorized(req: NextRequest): { ok: boolean; status: number } {
  const secret = process.env.ADMIN_ANALYTICS_SECRET;
  if (!secret) return { ok: false, status: 503 }; // misconfigured → closed
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== secret) return { ok: false, status: 401 };
  return { ok: true, status: 200 };
}

// Bucket ISO timestamps into YYYY-MM-DD counts.
function byDay(rows: { created_at: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) {
    return Response.json({ error: "unauthorized" }, { status: auth.status });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sb = supabaseAdmin();

  // Pull the windows we need in parallel. Everything is service-role.
  const [events, agentRuns, anonRuns] = await Promise.all([
    sb.from("product_events").select("event, user_id, anon_id, created_at").gte("created_at", since),
    sb.from("agent_runs").select("agent_type, outcome, cost_usd, created_at").gte("created_at", since),
    sb.from("anon_run_events").select("created_at").gte("created_at", since),
  ]);

  const evRows = events.data ?? [];
  const runRows = agentRuns.data ?? [];
  const anonRows = anonRuns.data ?? [];

  // Funnel: how many hit the blur gate vs. signed in vs. onboarded.
  const countEvent = (name: string) => evRows.filter((r) => r.event === name).length;

  // Per-agent run volume + spend from first-party telemetry.
  const perAgent: Record<string, { runs: number; errors: number; cost_usd: number }> = {};
  for (const r of runRows) {
    const a = (perAgent[r.agent_type] ??= { runs: 0, errors: 0, cost_usd: 0 });
    a.runs += 1;
    if (r.outcome === "error") a.errors += 1;
    a.cost_usd += Number(r.cost_usd ?? 0);
  }

  // "Untracked surfaces": event names present in product_events, so the agent
  // can diff this against the pages/actions it knows exist and flag gaps.
  const trackedEvents = Array.from(new Set(evRows.map((r) => r.event))).sort();

  const activeUsers = new Set(evRows.filter((r) => r.user_id).map((r) => r.user_id)).size;

  return Response.json({
    window_days: days,
    since,
    totals: {
      product_events: evRows.length,
      agent_runs: runRows.length,
      anon_runs: anonRows.length,
      distinct_active_users: activeUsers,
    },
    funnel: {
      blur_gate_hit: countEvent("blur_gate_hit"),
      blur_gate_signin_click: countEvent("blur_gate_signin_click"),
      sign_in: countEvent("sign_in"),
      signup: countEvent("signup"),
      onboarding_complete: countEvent("onboarding_complete"),
    },
    signups_by_day: byDay(evRows.filter((r) => r.event === "signup") as { created_at: string }[]),
    anon_runs_by_day: byDay(anonRows as { created_at: string }[]),
    per_agent: perAgent,
    tracked_events: trackedEvents,
  });
}
