import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { jobDetail } from "@/lib/jobs/serialize";
import type { Job, JobMatch } from "@/lib/db/schema";

export const runtime = "nodejs";

// GET /api/jobs/[id]
// Full job detail + the viewer's match. Side-effect: flips a 'new' match to
// 'seen' so the feed's NEW marker clears once opened.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: job, error } = await sb.from("jobs").select("*").eq("id", id).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!job) return Response.json({ error: "not found" }, { status: 404 });

    const { data: match } = await sb
      .from("job_matches")
      .select("*")
      .eq("user_id", userId)
      .eq("job_id", id)
      .maybeSingle();

    if (match && match.status === "new") {
      await sb
        .from("job_matches")
        .update({ status: "seen" })
        .eq("user_id", userId)
        .eq("job_id", id)
        .eq("status", "new");
      match.status = "seen";
    }

    return Response.json({ job: jobDetail(job as Job, (match as JobMatch | null) ?? null) });
  });
}
