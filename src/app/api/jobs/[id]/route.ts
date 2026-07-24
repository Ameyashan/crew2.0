import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { jobDetail } from "@/lib/jobs/serialize";
import type { Job, JobMatch, MatchStatus } from "@/lib/db/schema";

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

    // Whether the viewer follows this job's company, so the detail header can
    // render the Follow button in the right state.
    let following = false;
    const companyId = (job as Job).company_id;
    if (companyId) {
      const { data: follow } = await sb
        .from("followed_companies")
        .select("company_id")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      following = !!follow;
    }

    return Response.json({ job: jobDetail(job as Job, (match as JobMatch | null) ?? null), following });
  });
}

const PATCHABLE: MatchStatus[] = ["seen", "dismissed"];

// PATCH /api/jobs/[id] { status } — lifecycle update from the detail view
// (currently "dismiss", which hides the job from the feed).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async (userId) => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body?.status as MatchStatus;
    if (!PATCHABLE.includes(status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { error } = await sb
      .from("job_matches")
      .update({ status })
      .eq("user_id", userId)
      .eq("job_id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  });
}
