import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { isSectorId } from "@/lib/jobs/catalog/sectors";
import { loadScanPrefs } from "@/lib/jobs/scan";
import { trackerPresets } from "@/lib/jobs/tracker-catalog";

export const runtime = "nodejs";

// GET /api/jobs/tracker/presets?sector=fintech -> { presets: TrackerPreset[] }
// One-tap starting lists for setup: the user's onboarding target companies,
// top startups, the top employers in a sector, and top visa sponsors.
export async function GET(req: NextRequest) {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const raw = req.nextUrl.searchParams.get("sector");
    const sector = raw && isSectorId(raw) ? raw : null;
    const { pins } = await loadScanPrefs(sb, userId);
    const presets = await trackerPresets(sb, { sector, pins });
    return Response.json({ presets });
  });
}
