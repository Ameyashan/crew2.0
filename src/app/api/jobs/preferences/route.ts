import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { isSectorId } from "@/lib/jobs/catalog/sectors";
import type { PreferencesDTO, PostedWithin, SizeBucket } from "@/lib/jobs/types";

export const runtime = "nodejs";
// Saving preferences kicks off a bounded catalog-coverage pass (LLM + live
// validation), which can take a little while; give it room beyond the default.
export const maxDuration = 60;

const POSTED: PostedWithin[] = ["24h", "1wk", "1mo", "any"];
const SIZES: SizeBucket[] = ["large", "medium", "startup"];

const DEFAULTS: PreferencesDTO = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
  visa_required: false,
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

// Profile pins = the target_companies the user already gave in onboarding.
async function loadPins(): Promise<string[]> {
  const profile = await getProfile();
  const cs = profile?.context_structured;
  if (cs && typeof cs === "object" && Array.isArray((cs as Record<string, unknown>).target_companies)) {
    return strArray((cs as Record<string, unknown>).target_companies);
  }
  return [];
}

export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const { data } = await sb.from("job_preferences").select("*").eq("user_id", userId).maybeSingle();
    const pins = await loadPins();
    const dto: PreferencesDTO = data
      ? {
          interests: strArray(data.interests),
          posted_within: POSTED.includes(data.posted_within) ? data.posted_within : "any",
          company_sizes: strArray(data.company_sizes).filter((s): s is SizeBucket => SIZES.includes(s as SizeBucket)),
          locations: strArray(data.locations),
          visa_required: !!data.visa_required,
          pins,
        }
      : { ...DEFAULTS, pins };
    return Response.json({ preferences: dto });
  });
}

export async function PUT(req: NextRequest) {
  return withUser(async (userId) => {
    const body = await req.json().catch(() => ({}));

    const interests = strArray(body.interests).filter(isSectorId);
    const posted_within: PostedWithin = POSTED.includes(body.posted_within) ? body.posted_within : "any";
    const company_sizes = strArray(body.company_sizes).filter((s): s is SizeBucket => SIZES.includes(s as SizeBucket));
    const locations = strArray(body.locations).map((l) => l.toLowerCase().trim());
    const visa_required = !!body.visa_required;

    const sb = supabaseAdmin();
    const { error } = await sb.from("job_preferences").upsert(
      {
        user_id: userId,
        interests,
        posted_within,
        company_sizes,
        locations,
        visa_required,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const pins = await loadPins();

    // Grow the catalog for any newly-requested interests/pins so the first feed
    // isn't empty. Bounded + best-effort: never fail the save on a coverage hiccup.
    try {
      await ensureCatalogCoverage({ sectors: interests, companyNames: pins, addedBy: userId, maxValidate: 10 });
    } catch (e) {
      console.error("[jobs/preferences] ensureCatalogCoverage failed", e);
    }

    const dto: PreferencesDTO = { interests, posted_within, company_sizes, locations, visa_required, pins };
    return Response.json({ preferences: dto });
  });
}
