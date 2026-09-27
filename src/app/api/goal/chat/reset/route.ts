import { withUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { archiveOpenChat } from "@/lib/goal/store";

export const runtime = "nodejs";

// POST /api/goal/chat/reset — "Start over": archive the open coach chat. The
// locked goal (if any) is kept; the next message opens a fresh chat.
export async function POST() {
  return withUser(async (userId) => {
    await archiveOpenChat(supabaseAdmin(), userId);
    return Response.json({ ok: true });
  });
}
