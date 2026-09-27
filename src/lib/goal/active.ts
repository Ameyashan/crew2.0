// Read the user's locked goal. Split out of store.ts so the jobs pipeline
// (scan.ts / score.ts) can read it without importing the store, which itself
// imports the scan to re-rank after a lock.

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateGoalSpec, type GoalSpec } from "@/lib/goal/goal-logic";

export interface ActiveGoal {
  id: string;
  goal: GoalSpec;
  started_at: string;
  finalized_at: string;
}

export async function getActiveGoal(sb: SupabaseClient, uid: string): Promise<ActiveGoal | null> {
  const { data } = await sb
    .from("career_goals")
    .select("id, spec, started_at, finalized_at")
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  // Re-validate on read: spec is jsonb and could predate a schema tweak.
  const v = validateGoalSpec(data.spec);
  if (!v.ok) return null;
  return { id: data.id, goal: v.goal, started_at: data.started_at, finalized_at: data.finalized_at };
}
