import { supabaseAdmin } from "@/lib/supabase";
import { maybeUserId } from "@/lib/user-context";
import { trackServer } from "@/lib/analytics/server";

// Sonnet 4.6 pricing (USD per million tokens). Update if model changes.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
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
  // runs; it throws only outside a user context, which logAgentRun never is.
  const userId = maybeUserId();

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
    // Anonymous (blur-gate) runs persist nothing to agent_runs — there's no
    // account to bill the usage to, so skip the cost log. (The product_events
    // row above still captured that the run happened.) Kept inside the try so
    // this stays no-throw: an unexpected error is caught, not propagated.
    if (!userId) return;
    await supabaseAdmin().from("agent_runs").insert({
      user_id: userId,
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
