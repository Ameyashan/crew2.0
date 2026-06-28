import { withUser } from "@/lib/auth";
import { runUserScan } from "@/lib/jobs/scan";

export const runtime = "nodejs";
// On-demand refresh runs catalog coverage (LLM + live validation), a targeted
// board fetch, enrichment, and scoring — give it room beyond the default.
export const maxDuration = 300;

// POST /api/jobs/refresh
// Re-run the discovery pipeline for the current user against their saved
// preferences, then report how many matches were (re)scored. The feed reads
// job_matches, so the client refetches /api/jobs/feed after this resolves.
export async function POST() {
  return withUser(async (userId) => {
    try {
      const summary = await runUserScan(userId);
      return Response.json({ ok: true, ...summary });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
  });
}
