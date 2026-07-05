import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { updateStoryEntry, deleteStoryEntry, type StoryPatch, type StoryStatus } from "@/lib/story";

export const runtime = "nodejs";

const STATUSES: StoryStatus[] = ["raw", "pending", "proposed", "polished"];

// PATCH /api/story/:id → edit an entry. Handles the prototype's edit-save
// (`raw`), Approve (`status:'polished'`), Keep-it-raw (`status:'raw'`), and tag
// edits. Only the fields sent are touched.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async () => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const patch: StoryPatch = {};
    if (typeof body?.raw === "string") {
      const raw = body.raw.trim();
      if (!raw) return Response.json({ error: "raw cannot be empty" }, { status: 400 });
      patch.raw = raw;
    }
    if (body?.bullet === null) patch.bullet = null;
    else if (typeof body?.bullet === "string") patch.bullet = body.bullet.trim() || null;
    if (typeof body?.status === "string") {
      if (!STATUSES.includes(body.status as StoryStatus)) {
        return Response.json({ error: "invalid status" }, { status: 400 });
      }
      patch.status = body.status as StoryStatus;
    }
    if (Array.isArray(body?.tags)) {
      patch.tags = body.tags.filter((t: unknown): t is string => typeof t === "string");
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }

    const entry = await updateStoryEntry(id, patch);
    if (!entry) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ entry });
  });
}

// DELETE /api/story/:id → remove the entry (the edit card's red "delete").
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async () => {
    const { id } = await params;
    await deleteStoryEntry(id);
    return Response.json({ ok: true });
  });
}
