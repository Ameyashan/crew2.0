import { NextRequest } from "next/server";
import { loadTodayData } from "@/lib/today";
import { supabaseAdmin } from "@/lib/supabase";
import { runWithUser } from "@/lib/user-context";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  // Fail CLOSED: a missing CRON_SECRET disables the endpoint (503) rather than
  // leaving it open to the internet. Previously the guard was skipped entirely
  // when the secret was unset. CRON_SECRET is set in Vercel prod, so this is a
  // no-op today and a backstop if it ever gets removed. Vercel Cron sends
  // `Authorization: Bearer <CRON_SECRET>`; a manual caller may pass x-cron-secret.
  if (!expected) {
    return Response.json({ error: "cron secret not configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${expected}` && req.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Build a digest for every onboarded user. No session here (cron is
  // server-to-server), so we set the user context explicitly per iteration.
  const { data: profiles, error: pErr } = await sb
    .from("user_profile")
    .select("user_id")
    .not("onboarded_at", "is", null);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];
  for (const { user_id } of profiles ?? []) {
    try {
      await runWithUser(user_id as string, async () => {
        const { due, reviews } = await loadTodayData();
        const snapshot = {
          due: due.map((d) => ({ id: d.id, person: d.person.name, due_at: d.due_at })),
          reviews: reviews.map((r) => ({
            id: r.interaction_id,
            person: r.person.name,
            sent_at: r.sent_at,
          })),
        };
        const { error } = await sb.from("daily_digests").insert({
          user_id,
          pending_followups: due.length,
          pending_reviews: reviews.length,
          snapshot,
        });
        if (error) throw new Error(error.message);
      });
      results.push({ user_id: user_id as string, ok: true });
    } catch (e) {
      results.push({
        user_id: user_id as string,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({ ok: true, count: results.length, results });
}
