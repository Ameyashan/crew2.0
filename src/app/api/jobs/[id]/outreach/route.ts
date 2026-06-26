import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/jobs/[id]/outreach
// The hand-off into the existing Compose pipeline. Marks the match
// 'outreach_started' and returns the job URL; the client then calls
// startRun(job_url, { kind: 'job' }) — no new outreach pipeline here.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: job, error } = await sb.from("jobs").select("id, url").eq("id", id).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!job?.url) return Response.json({ error: "not found" }, { status: 404 });

    // Best-effort status flip; absence of a match row shouldn't block the hand-off.
    await sb
      .from("job_matches")
      .update({ status: "outreach_started" })
      .eq("user_id", userId)
      .eq("job_id", id)
      .neq("status", "dismissed");

    return Response.json({ job_url: job.url });
  });
}
