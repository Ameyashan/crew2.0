import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { listStoryEntries, createStoryEntry } from "@/lib/story";

export const runtime = "nodejs";

// GET /api/story → the account's Story entries, newest first.
export async function GET() {
  return withUser(async () => {
    const entries = await listStoryEntries();
    return Response.json({ entries });
  });
}

// POST /api/story → create one raw entry (quick-add). Body: { raw, tags? }.
export async function POST(req: NextRequest) {
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.raw === "string" ? body.raw.trim() : "";
    if (!raw) return Response.json({ error: "raw is required" }, { status: 400 });
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === "string")
      : undefined;
    const entry = await createStoryEntry({ raw, tags });
    return Response.json({ entry }, { status: 201 });
  });
}
