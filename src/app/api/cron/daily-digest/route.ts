import { NextRequest } from "next/server";
import { loadTodayData } from "@/lib/today";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Allow either.
  if (expected && auth !== `Bearer ${expected}` && req.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { due, reviews } = await loadTodayData();
  const snapshot = {
    due: due.map((d) => ({ id: d.id, person: d.person.name, due_at: d.due_at })),
    reviews: reviews.map((r) => ({
      id: r.interaction_id,
      person: r.person.name,
      sent_at: r.sent_at,
    })),
  };

  const { data, error } = await supabaseAdmin()
    .from("daily_digests")
    .insert({
      user_id: USER_ID,
      pending_followups: due.length,
      pending_reviews: reviews.length,
      snapshot,
    })
    .select("id, generated_at, pending_followups, pending_reviews")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, digest: data });
}
