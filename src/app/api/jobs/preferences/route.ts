import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { ensureCatalogCoverage } from "@/lib/jobs/catalog";
import { isSectorId } from "@/lib/jobs/catalog/sectors";
import { coerceRoleMode } from "@/lib/jobs/scan";
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
  role_mode: null,
  target_roles: [],
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

// Read the target_companies (pins) + current_role a user already gave in
// onboarding, in one profile fetch.
async function loadProfileSignals(): Promise<{ pins: string[]; current_role: string | null }> {
  const profile = await getProfile();
  const cs = profile?.context_structured;
  const obj = cs && typeof cs === "object" ? (cs as Record<string, unknown>) : null;
  const pins = obj && Array.isArray(obj.target_companies) ? strArray(obj.target_companies) : [];
  const current_role =
    obj && typeof obj.current_role === "string" && obj.current_role.trim() ? obj.current_role.trim() : null;
  return { pins, current_role };
}

export async function GET() {
  return withUser(async (userId) => {
    const sb = supabaseAdmin();
    const { data } = await sb.from("job_preferences").select("*").eq("user_id", userId).maybeSingle();
    const { pins, current_role } = await loadProfileSignals();
    const dto: PreferencesDTO = data
      ? {
          interests: strArray(data.interests),
          posted_within: POSTED.includes(data.posted_within) ? data.posted_within : "any",
          company_sizes: strArray(data.company_sizes).filter((s): s is SizeBucket => SIZES.includes(s as SizeBucket)),
          locations: strArray(data.locations),
          visa_required: !!data.visa_required,
          role_mode: coerceRoleMode(data.role_mode),
          target_roles: strArray(data.target_roles),
          current_role,
          pins,
        }
      : { ...DEFAULTS, current_role, pins };
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
    const role_mode = coerceRoleMode(body.role_mode);
    // Only meaningful when role_mode === "different"; cap + trim so a junk
    // payload can't bloat the scorer prompt.
    const target_roles =
      role_mode === "different" ? strArray(body.target_roles).map((r) => r.trim()).slice(0, 6) : [];

    const sb = supabaseAdmin();

    // Detect a change to the matching axis (interests / role targeting). When it
    // changes, the existing 'new' rankings are stale — clear them so the next
    // scan re-scores against the new preferences. 'dismissed' / outreach rows are
    // preserved (they carry user intent, not just a ranking).
    const { data: prev } = await sb
      .from("job_preferences")
      .select("interests, role_mode, target_roles")
      .eq("user_id", userId)
      .maybeSingle();
    const sameArr = (a: unknown, b: string[]) => {
      const x = strArray(a).slice().sort();
      const y = b.slice().sort();
      return x.length === y.length && x.every((v, i) => v === y[i]);
    };
    const matchingChanged =
      !prev ||
      prev.role_mode !== role_mode ||
      !sameArr(prev.interests, interests) ||
      !sameArr(prev.target_roles, target_roles);

    const { error } = await sb.from("job_preferences").upsert(
      {
        user_id: userId,
        interests,
        posted_within,
        company_sizes,
        locations,
        visa_required,
        role_mode,
        target_roles,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (matchingChanged) {
      // Best-effort: a failure here just means the old rankings linger until the
      // daily cron re-scores — not worth failing the save.
      const { error: delErr } = await sb
        .from("job_matches")
        .delete()
        .eq("user_id", userId)
        .eq("status", "new");
      if (delErr) console.error("[jobs/preferences] clear stale matches failed", delErr);
    }

    const { pins, current_role } = await loadProfileSignals();

    // Grow the catalog for any newly-requested interests/pins so the first feed
    // isn't empty. Bounded + best-effort: never fail the save on a coverage hiccup.
    try {
      await ensureCatalogCoverage({ sectors: interests, companyNames: pins, addedBy: userId, maxValidate: 10 });
    } catch (e) {
      console.error("[jobs/preferences] ensureCatalogCoverage failed", e);
    }

    const dto: PreferencesDTO = {
      interests,
      posted_within,
      company_sizes,
      locations,
      visa_required,
      role_mode,
      target_roles,
      current_role,
      pins,
    };
    return Response.json({ preferences: dto });
  });
}
