import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";

export const runtime = "nodejs";

// Same anon-owning cookie the apply route sets.
const ANON_COOKIE = "jugaadu_anon";

// GET /api/compose/history/[id]
// Returns the full persisted compose run so the client can observe its progress
// (steps + heartbeat) and, on completion, rebuild the package card from output.
// Signed-in callers see their own runs (by user_id); signed-out callers see the
// runs owned by their anon cookie (anon_id) — nothing else.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await resolveUserId();
  const sb = supabaseAdmin();

  let query = sb
    .from("compose_runs")
    .select(
      "id, kind, input, intent, provided_email, picked, output, outcome, error, person_id, screenshot_id, resume_generation_id, steps, heartbeat_at, created_at, completed_at"
    )
    .eq("id", id);

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    // Anonymous: gate strictly on the caller's own anon token.
    const anonId = (await cookies()).get(ANON_COOKIE)?.value;
    if (!anonId) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    query = query.eq("anon_id", anonId);
  }

  const { data: run, error } = await query.maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!run) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Surface the screenshot meta inline so the package card header can show the
  // attached-image chip without a second round-trip. (Anonymous runs don't
  // persist screenshots, so this only ever resolves for signed-in callers.)
  let screenshot: { name: string; size: string } | null = null;
  if (run.screenshot_id && userId) {
    const { data: shot } = await sb
      .from("screenshots")
      .select("path, byte_size")
      .eq("user_id", userId)
      .eq("id", run.screenshot_id)
      .maybeSingle();
    if (shot?.path) {
      const name = shot.path.split("/").pop() || "screenshot";
      const size = shot.byte_size ? `${Math.round(Number(shot.byte_size) / 1024)} KB` : "";
      screenshot = { name, size };
    }
  }

  return Response.json({ run: { ...run, screenshot } });
}
