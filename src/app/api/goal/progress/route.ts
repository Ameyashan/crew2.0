import { withUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveGoal } from "@/lib/goal/active";
import { loadGoalProgress } from "@/lib/goal/progress";
import { goalProgressModel } from "@/lib/goal/progress-logic";

export const runtime = "nodejs";

// GET /api/goal/progress — funnel counts since the locked goal started, the
// next-step nudge, and whether to suggest refining. { progress: null } when
// there's no goal.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const active = await getActiveGoal(sb, userId);
    if (!active) return Response.json({ progress: null });
    const counts = await loadGoalProgress(sb, userId, active);
    return Response.json({ progress: { counts, ...goalProgressModel(counts) } });
  });
}
