import { NextRequest } from "next/server";
import { getProfile, upsertProfile } from "@/lib/profile";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getProfile();
  return Response.json({ profile });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await upsertProfile({
    full_name: body.full_name ?? null,
    linkedin_url: body.linkedin_url ?? null,
    writing_samples: body.writing_samples ?? null,
    followup_days:
      typeof body.followup_days === "number" ? body.followup_days : null,
    context_prompt:
      typeof body.context_prompt === "string"
        ? body.context_prompt.trim() || null
        : body.context_prompt === null
          ? null
          : undefined,
    resume_text: body.resume_text ?? undefined,
    resume_filename: body.resume_filename ?? undefined,
    onboarded_at: body.onboarded ? new Date().toISOString() : undefined,
  });
  return Response.json({ ok: true });
}
