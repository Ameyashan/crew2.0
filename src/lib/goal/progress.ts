// Goal progress counts (see progress-logic.ts for the model). "Strong matches"
// is read off the same ranked feed the Jobs tab shows (src/lib/jobs/feed.ts),
// so the number on the goal page is exactly the roles under "Strong matches"
// there. The rest are head-only counts scoped to the goal's lifetime:
// started_at for the user's own actions (carried across refinements), and
// finalized_at for "dismissed under the current goal" — a lock clears and
// re-scores matches, so scored_at ≥ finalized_at means "born under this goal".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveGoal } from "@/lib/goal/active";
import type { GoalProgressCounts } from "@/lib/goal/progress-logic";
import { loadRankedFeed } from "@/lib/jobs/feed";

export async function loadGoalProgress(sb: SupabaseClient, uid: string, active: ActiveGoal): Promise<GoalProgressCounts> {
  const since = active.started_at;
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    if (error) console.error("[goal/progress] count failed", error);
    return n ?? 0;
  };
  const head = { count: "exact" as const, head: true };

  const [strong_matches, applications, submitted, outreach_sent, replies, dismissed_since_lock] = await Promise.all([
    loadRankedFeed(sb, uid)
      .then((f) => f.strong)
      .catch((e) => {
        console.error("[goal/progress] feed failed", e);
        return 0;
      }),
    count(sb.from("job_applications").select("id", head).eq("user_id", uid).gte("created_at", since)),
    count(sb.from("job_applications").select("id", head).eq("user_id", uid).gte("submitted_at", since)),
    count(sb.from("interactions").select("id", head).eq("user_id", uid).eq("interaction_type", "sent").gte("created_at", since)),
    count(sb.from("interactions").select("id", head).eq("user_id", uid).eq("interaction_type", "replied").gte("created_at", since)),
    count(
      sb
        .from("job_matches")
        .select("id", head)
        .eq("user_id", uid)
        .eq("status", "dismissed")
        .gte("scored_at", active.finalized_at),
    ),
  ]);
  return { strong_matches, applications, submitted, outreach_sent, replies, dismissed_since_lock };
}
