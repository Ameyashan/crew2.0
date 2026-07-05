import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { polishStoryEntry } from "@/lib/claude";
import type { StoryEntry } from "@/lib/db/schema";

export const runtime = "nodejs";
// The résumé agent makes a live model call; give it room beyond the default.
export const maxDuration = 30;

// POST /api/story/[id]/polish — run the résumé agent over a raw entry, turning it
// into a proposed resume-ready bullet + theme tags the user can approve.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: entry, error } = await sb
      .from("story_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!entry) return Response.json({ error: "not found" }, { status: 404 });

    let bullet: string;
    let tags: string[];
    try {
      const polished = await polishStoryEntry((entry as StoryEntry).raw);
      bullet = polished.bullet;
      tags = polished.tags;
    } catch (e) {
      console.error("[story] polish failed", e);
      // Leave the entry as it was (still `pending`) so the client can retry.
      return Response.json({ error: `polish failed: ${e}` }, { status: 502 });
    }

    const { data: updated, error: upErr } = await sb
      .from("story_entries")
      .update({ status: "proposed", bullet, tags, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
    if (!updated) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ entry: updated as StoryEntry });
  });
}
