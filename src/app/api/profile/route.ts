import { NextRequest } from "next/server";
import { getProfile, upsertProfile } from "@/lib/profile";
import { extractUserContext } from "@/lib/agents/extract-context";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getProfile();
  return Response.json({ profile });
}

export async function POST(req: NextRequest) {
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

  await upsertProfile({
    full_name: body.full_name ?? null,
    linkedin_url: body.linkedin_url ?? null,
    writing_samples: body.writing_samples ?? null,
    followup_days:
      typeof body.followup_days === "number" ? body.followup_days : null,
    context_prompt: incomingContext,
    context_structured,
    resume_text: body.resume_text ?? undefined,
    resume_filename: body.resume_filename ?? undefined,
    onboarded_at: body.onboarded ? new Date().toISOString() : undefined,
  });
  return Response.json({ ok: true });
}
