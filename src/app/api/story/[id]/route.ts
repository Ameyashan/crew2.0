import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import type { StoryEntry } from "@/lib/db/schema";

export const runtime = "nodejs";

// PATCH /api/story/[id] — lifecycle + edits from the Story page:
//   { action: "approve" }   proposed → polished (keep the bullet)
//   { action: "keep_raw" }  proposed → raw (drop back to the user's words)
//   { raw }                 edit the raw text (edit card Save)
//   { tags }                replace the tag set
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (userId) => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const patch: Partial<StoryEntry> = {};
    if (body?.action === "approve") {
      patch.status = "polished";
    } else if (body?.action === "keep_raw") {
      patch.status = "raw";
    }
    if (typeof body?.raw === "string") {
      const raw = body.raw.trim();
      if (!raw) return Response.json({ error: "empty entry" }, { status: 400 });
      patch.raw = raw;
    }
    if (Array.isArray(body?.tags)) {
      patch.tags = body.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("story_entries")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ entry: data as StoryEntry });
  });
}

// DELETE /api/story/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (userId) => {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { error } = await sb.from("story_entries").delete().eq("id", id).eq("user_id", userId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  });
}
