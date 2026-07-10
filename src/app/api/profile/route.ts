import { NextRequest } from "next/server";
import { getProfile, upsertProfile, type ProfilePatch } from "@/lib/profile";
import { extractUserContext } from "@/lib/agents/extract-context";
import { withUser } from "@/lib/auth";
import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";

export async function GET() {
  return withUser(async () => {
    const profile = await getProfile();
    return Response.json({ profile });
  });
}

export async function POST(req: NextRequest) {
  return withUser(async () => {
  const body = await req.json();

  const incomingContext =
    typeof body.context_prompt === "string"
      ? body.context_prompt.trim() || null
      : body.context_prompt === null
        ? null
        : undefined;

  // Re-extract structured context only when the paste actually changes.
  let context_structured: Record<string, unknown> | null | undefined = undefined;
  if (incomingContext !== undefined) {
    const existing = await getProfile();
    if (incomingContext === null) {
      context_structured = null;
    } else if (incomingContext !== (existing?.context_prompt ?? null)) {
      try {
        context_structured = (await extractUserContext(incomingContext)) as
          | Record<string, unknown>
          | null;
      } catch (e) {
        console.error("extractUserContext failed", e);
      }
    }
  }

  // Partial update: only touch the fields the caller actually sent. This lets the
  // settings page update one section (e.g. LinkedIn) without clobbering the rest
  // of the profile.
  const patch: ProfilePatch = {};
  if ("full_name" in body) patch.full_name = body.full_name ?? null;
  if ("linkedin_url" in body) patch.linkedin_url = body.linkedin_url ?? null;
  if ("writing_samples" in body) patch.writing_samples = body.writing_samples ?? null;
  if ("followup_days" in body)
    patch.followup_days =
      typeof body.followup_days === "number" ? body.followup_days : null;
  if (incomingContext !== undefined) patch.context_prompt = incomingContext;
  if (context_structured !== undefined) patch.context_structured = context_structured;
  if ("resume_text" in body) patch.resume_text = body.resume_text ?? null;
  if ("resume_filename" in body) patch.resume_filename = body.resume_filename ?? null;
  if (body.onboarded) patch.onboarded_at = new Date().toISOString();

  // Activation analytics: crossing onboarding is the key funnel step.
  if (body.onboarded) await trackServer("onboarding_complete");

  await upsertProfile(patch);
  return Response.json({ ok: true });
  });
}
