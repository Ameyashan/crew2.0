import { supabaseAdmin } from "@/lib/supabase";
import { maybeUserId, isSystemRun } from "@/lib/user-context";
import { trackServer } from "@/lib/analytics/server";
import { noteSystemSpend } from "@/lib/llm-budget";

// Sonnet 4.6 pricing (USD per million tokens). Update if model changes.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export function estimateCost(model: string, input: number, output: number) {
  const p = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  return (input * p.input + output * p.output) / 1_000_000;
}

export interface AgentRunLog {
  agent_type: string;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms: number;
  outcome: "ok" | "error" | "no_match";
  error?: string | null;
  meta?: Record<string, unknown>;
}

export async function logAgentRun(run: AgentRunLog) {
  const cost =
    run.model && run.input_tokens != null && run.output_tokens != null
      ? estimateCost(run.model, run.input_tokens, run.output_tokens)
      : null;

  // Read the run's owner once. maybeUserId() is null for anonymous (blur-gate)
  // and system (cron) runs; it throws only outside a user context, which
  // logAgentRun never is.
  const userId = maybeUserId();
  const system = isSystemRun();
  if (system && cost) noteSystemSpend(cost);

  // Product-analytics event for EVERY run, signed-in or anon — this is the
  // single busiest choke point, so instrumenting it here gives the
  // cofounder-analytics agent per-agent usage + success rates for free. Anon
  // runs get a null-owned event (they never reach the agent_runs insert below).
  await trackServer(
    "run_completed",
    { agent_type: run.agent_type, outcome: run.outcome, latency_ms: run.latency_ms },
    { userId },
  );

  try {
    // Every run is logged, user-less ones included (user_id null; `system`
    // set for cron work) — unlogged cron spend is how a ~$110 day went
    // unnoticed. Kept inside the try so this stays no-throw: an unexpected
    // error is caught, not propagated.
    await supabaseAdmin().from("agent_runs").insert({
      user_id: userId,
      system,
      agent_type: run.agent_type,
      model: run.model ?? null,
      input_tokens: run.input_tokens ?? null,
      output_tokens: run.output_tokens ?? null,
      cost_usd: cost,
      latency_ms: run.latency_ms,
      outcome: run.outcome,
      error: run.error ?? null,
      meta: run.meta ?? {},
    });
  } catch (e) {
    console.error("[agent_runs] failed to log", e);
  }
}
