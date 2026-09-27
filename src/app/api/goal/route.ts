import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { trackServer } from "@/lib/analytics/server";
import { validateGoalSpec } from "@/lib/goal/goal-logic";
import { pendingProposal, toDisplayMessages } from "@/lib/goal/chat-logic";
import { getActiveGoal, getOpenChat, loadMessages, lockGoal } from "@/lib/goal/store";

export const runtime = "nodejs";
// Locking re-scans the feed in an after() continuation, which runs within this
// route's duration budget.
export const maxDuration = 300;

// GET /api/goal — the locked goal (if any) plus the open coach chat, rendered
// for display, and the proposal card still awaiting a lock (if any).
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const [active, chat] = await Promise.all([getActiveGoal(sb, userId), getOpenChat(sb, userId)]);
    const history = chat ? await loadMessages(sb, chat.id) : [];
    return Response.json({
      goal: active,
      chat: chat ? { id: chat.id, messages: toDisplayMessages(history) } : null,
      pending_proposal: pendingProposal(history),
    });
  });
}

// POST /api/goal — lock a goal, either as the coach proposed it (tool_use_id
// set) or edited on the card / goal page. The body's goal is untrusted and is
// re-validated. refresh:false skips the background re-scan (onboarding runs its
// own refresh once preferences are saved).
export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));
    const v = validateGoalSpec(body?.goal);
    if (!v.ok) return Response.json({ error: v.errors.join("; ") }, { status: 400 });

    const sb = supabaseAdmin();
    // Only close the loop on the caller's own open chat.
    const chat = typeof body?.chat_id === "string" ? await getOpenChat(sb, userId) : null;
    const chatId = chat && chat.id === body.chat_id ? chat.id : null;
    const toolUseId = chatId && typeof body?.tool_use_id === "string" ? body.tool_use_id : null;

    try {
      const res = await lockGoal(userId, {
        goal: v.goal,
        chatId,
        toolUseId,
        refresh: body?.refresh !== false,
      });
      await trackServer("goal_locked", {
        source: body?.source === "onboarding" ? "onboarding" : "app",
        refined: res.refined,
        edited: body?.edited === true,
      });
      return Response.json({ goal: res.goal });
    } catch (e) {
      console.error("[goal] lock failed", e);
      return Response.json({ error: "Couldn't save your goal — try again." }, { status: 500 });
    }
  });
}
