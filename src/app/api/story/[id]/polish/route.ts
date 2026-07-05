import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { getStoryEntry, updateStoryEntry } from "@/lib/story";
import { polishEntry } from "@/lib/agents/polish-entry";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/story/:id/polish → hand a raw entry to the resume agent. Produces a
// resume-ready `bullet` and marks the entry `proposed` (awaiting the user's
// Approve / Keep it raw). The "…is polishing this" pending state is shown
// client-side while this request is in flight.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withUser(async () => {
    const { id } = await params;
    const existing = await getStoryEntry(id);
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });

    let polished;
    try {
      polished = await polishEntry(existing.raw);
    } catch (e) {
      return Response.json({ error: `polish failed: ${e}` }, { status: 502 });
    }
    if (!polished) {
      return Response.json({ error: "could not polish this entry" }, { status: 422 });
    }

    // Merge any newly-inferred tags with the entry's existing ones (deduped).
    const tags = Array.from(new Set([...(existing.tags ?? []), ...polished.tags]));
    const entry = await updateStoryEntry(id, {
      bullet: polished.bullet,
      status: "proposed",
      tags,
    });
    if (!entry) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ entry });
  });
}
