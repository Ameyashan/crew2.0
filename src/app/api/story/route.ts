import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import type { StoryEntry } from "@/lib/db/schema";

export const runtime = "nodejs";

// GET /api/story — the viewer's Story, newest first.
export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("story_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ entries: (data as StoryEntry[]) ?? [] });
  });
}

// POST /api/story { raw } — log a raw entry. Lands as `pending` so the UI shows
// the "resume agent is polishing this…" pulse; the client then calls the polish
// endpoint to turn it into a proposed bullet.
export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.raw === "string" ? body.raw.trim() : "";
    if (!raw) return Response.json({ error: "empty entry" }, { status: 400 });

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("story_entries")
      .insert({ user_id: userId, raw, status: "pending" })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ entry: data as StoryEntry });
  });
}
