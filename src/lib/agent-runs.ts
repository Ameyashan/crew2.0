import { supabaseAdmin } from "@/lib/supabase";
import { currentUserId } from "@/lib/user-context";

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

  try {
    await supabaseAdmin().from("agent_runs").insert({
      user_id: currentUserId(),
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
