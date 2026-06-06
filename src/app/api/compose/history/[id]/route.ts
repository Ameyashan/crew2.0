import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/compose/history/[id]
// Returns the full persisted compose run (with linked person + screenshot meta)
// so the history page can hydrate the runs-store and render the package card.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: run, error } = await sb
      .from("compose_runs")
      .select(
        "id, kind, input, intent, provided_email, picked, output, outcome, error, person_id, screenshot_id, resume_generation_id, created_at, completed_at"
      )
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!run) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Surface the screenshot meta inline so the package card header can show
    // the attached-image chip without a second round-trip.
    let screenshot: { name: string; size: string } | null = null;
    if (run.screenshot_id) {
      const { data: shot } = await sb
        .from("screenshots")
        .select("path, byte_size")
        .eq("user_id", userId)
        .eq("id", run.screenshot_id)
        .maybeSingle();
      if (shot?.path) {
        const name = shot.path.split("/").pop() || "screenshot";
        const size = shot.byte_size
          ? `${Math.round(Number(shot.byte_size) / 1024)} KB`
          : "";
        screenshot = { name, size };
      }
    }

    return Response.json({ run: { ...run, screenshot } });
  });
}
