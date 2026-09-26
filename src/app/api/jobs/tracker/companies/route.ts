import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { trackServer } from "@/lib/analytics/server";
import { TRACK_LIMIT } from "@/lib/jobs/tracker-match";

export const runtime = "nodejs";

// PUT /api/jobs/tracker/companies { company_ids } -> { company_ids }
// Replace the user's tracked set in one go (setup's "Start tracking"). Every
// id must be an active catalog board; at most TRACK_LIMIT.
export async function PUT(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body?.company_ids) ? body.company_ids : [];
    const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
    if (ids.length > TRACK_LIMIT) {
      return Response.json({ error: `You can track up to ${TRACK_LIMIT} companies.` }, { status: 400 });
    }

    const sb = supabaseAdmin();
    if (ids.length) {
      const { data, error } = await sb.from("companies").select("id").in("id", ids).eq("active", true);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if ((data ?? []).length !== ids.length) {
        return Response.json({ error: "Some of those companies can't be tracked." }, { status: 400 });
      }
    }

    // Drop what's no longer picked, then add the rest. Existing rows keep
    // their created_at (ignoreDuplicates), which orders the tracker.
    let del = sb.from("followed_companies").delete().eq("user_id", userId);
    if (ids.length) del = del.not("company_id", "in", `(${ids.join(",")})`);
    const { error: delErr } = await del;
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
    if (ids.length) {
      const { error: insErr } = await sb
        .from("followed_companies")
        .upsert(
          ids.map((company_id) => ({ user_id: userId, company_id })),
          { onConflict: "user_id,company_id", ignoreDuplicates: true },
        );
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    }

    await trackServer("tracker_companies_saved", { count: ids.length });
    return Response.json({ company_ids: ids });
  });
}
