import { NextRequest } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Stitch a pre-signup anonymous journey to the now-authenticated account.
// The blur-gate/landing events this browser logged while signed out carry an
// anon_id but a null user_id (see /api/events); once the visitor signs in we
// backfill user_id onto those rows so the activation funnel connects the two
// halves. Called one-shot right after OAuth (AuthLoadingOverlay).
//
// user_id is resolved from the session cookie, NEVER trusted from the body;
// anon_id is the client's localStorage id. Best-effort and silent — analytics
// must never surface to the user or retry-storm.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return new Response(null, { status: 204 });

  const body = await req.json().catch(() => ({}));
  const anonId = typeof body?.anon_id === "string" ? body.anon_id.slice(0, 64) : null;
  if (!anonId) return new Response(null, { status: 204 });

  try {
    await supabaseAdmin()
      .from("product_events")
      .update({ user_id: userId })
      .eq("anon_id", anonId)
      .is("user_id", null);
  } catch (e) {
    console.error("[analytics/identify] stitch failed", e);
  }

  return new Response(null, { status: 204 });
}
