// Daily cap on unattended LLM spend. Cron work (runAsSystem, see
// user-context.ts) has no user watching it, so a bug or a data spike can burn
// money until someone reads the bill — the company-universe scale-up ran ~27k
// visa-parse calls (~$110) in a day. Each system LLM call site checks
// systemBudgetExhausted() first and, when the day's system spend (agent_runs
// rows with system = true, UTC day) has reached the cap, skips the call the
// same way it handles a model outage: the work stays queued for tomorrow.
//
// User-initiated work never checks this (it's false outside a system run).
// The cap is SYSTEM_LLM_DAILY_USD (default $5). Costs are logAgentRun's
// token-based estimates, so server-tool fees (web search) aren't counted.

import { supabaseAdmin } from "@/lib/supabase";
import { isSystemRun } from "@/lib/user-context";

const DEFAULT_DAILY_USD = 5;
// Spend is re-read from the DB at most this often per instance; this
// instance's own spend is added in between (noteSystemSpend).
const REFRESH_MS = 60_000;

export function systemDailyBudgetUsd(): number {
  const raw = process.env.SYSTEM_LLM_DAILY_USD;
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_USD;
}

const utcDay = () => new Date().toISOString().slice(0, 10);

let cache: { day: string; spent: number; at: number } | null = null;
let warnedDay: string | null = null;

export async function systemSpendToday(): Promise<number> {
  const day = utcDay();
  if (cache && cache.day === day && Date.now() - cache.at < REFRESH_MS) return cache.spent;
  const { data, error } = await supabaseAdmin().rpc("system_llm_spend_since", { since: `${day}T00:00:00Z` });
  if (error) {
    // Fail open: a telemetry hiccup shouldn't stall the pipeline, and the
    // next check re-reads.
    console.error("[llm-budget] spend lookup failed", error.message);
    return cache?.day === day ? cache.spent : 0;
  }
  cache = { day, spent: Number(data ?? 0), at: Date.now() };
  return cache.spent;
}

// Called by logAgentRun for every system run's cost.
export function noteSystemSpend(usd: number) {
  if (cache && cache.day === utcDay()) cache.spent += usd;
}

// True when unattended LLM work should stop for the day. Always false outside
// a system run.
export async function systemBudgetExhausted(): Promise<boolean> {
  if (!isSystemRun()) return false;
  const cap = systemDailyBudgetUsd();
  const spent = await systemSpendToday();
  if (spent < cap) return false;
  const day = utcDay();
  if (warnedDay !== day) {
    warnedDay = day;
    console.error(
      `[llm-budget] system LLM budget exhausted: $${spent.toFixed(2)} of $${cap.toFixed(2)} today (UTC). ` +
        "Cron LLM work is paused until tomorrow; raise SYSTEM_LLM_DAILY_USD to resume sooner.",
    );
  }
  return true;
}

// For cron responses / operator status.
export async function systemBudgetStatus() {
  const cap = systemDailyBudgetUsd();
  const spent = await systemSpendToday();
  return { spent_usd: Math.round(spent * 100) / 100, cap_usd: cap, exhausted: spent >= cap };
}
