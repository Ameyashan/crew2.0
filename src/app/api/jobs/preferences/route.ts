import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { isSectorId } from "@/lib/jobs/catalog/sectors";
import { coerceRoleMode } from "@/lib/jobs/scan";
import type { PreferencesDTO, PostedWithin, SizeBucket } from "@/lib/jobs/types";

export const runtime = "nodejs";

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
  daily_email: true,
  include_universe: true,
  include_staffing: false,
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
          daily_email: data.daily_email !== false,
          include_universe: data.include_universe !== false,
          include_staffing: data.include_staffing === true,
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
    // Anything but an explicit false means keep the daily email on.
    const daily_email = body.daily_email !== false;
    // Universe scanning defaults on; staffing firms only on explicit opt-in.
    const include_universe = body.include_universe !== false;
    const include_staffing = body.include_staffing === true;

    const sb = supabaseAdmin();

    // Detect a change to the matching axis (interests / role targeting). When it
    // changes, the existing 'new' rankings are stale — clear them so the next
    // scan re-scores against the new preferences. 'dismissed' / outreach rows are
    // preserved (they carry user intent, not just a ranking).
    const { data: prev } = await sb
      .from("job_preferences")
      .select("interests, role_mode, target_roles, include_universe")
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
      // Turning the universe pool off must drop the matches it contributed.
      (prev.include_universe !== false) !== include_universe ||
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
        daily_email,
        include_universe,
        include_staffing,
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

    // No catalog growth here: that's an LLM pass, and saving is frequent (the
    // tracker setup saves roles/locations). The Recommended tab's explicit
    // Refresh grows the catalog for the user's sectors (src/lib/jobs/scan.ts).
    const { pins, current_role } = await loadProfileSignals();

    const dto: PreferencesDTO = {
      interests,
      posted_within,
      company_sizes,
      locations,
      visa_required,
      role_mode,
      target_roles,
      daily_email,
      include_universe,
      include_staffing,
      current_role,
      pins,
    };
    return Response.json({ preferences: dto });
  });
}
