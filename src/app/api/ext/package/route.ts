import { NextRequest } from "next/server";
import { withExtensionToken } from "@/lib/ext-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { jobUrlsMatch } from "@/lib/job-url-normalize";
import { resumeFilename } from "@/lib/resume-pdf-render";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import type { ApplicationQA } from "@/lib/db/schema";

export const runtime = "nodejs";

const APP_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://jugaadu.app";

// The extension's one read: everything needed to fill an application form for
// the job open in the current tab. Matches the tab URL against the user's
// recent compose runs (see job-url-normalize.ts for why exact equality fails).

export async function GET(req: NextRequest) {
  return withExtensionToken(req, async (userId) => {
    const url = req.nextUrl.searchParams.get("url") ?? "";
    if (!url) return Response.json({ error: "url required" }, { status: 400 });

    const profile = await getProfile();
    const profileOut = profile
      ? {
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          linkedin_url: profile.linkedin_url,
          github_url: profile.github_url,
          portfolio_url: profile.portfolio_url,
          needs_sponsorship: profile.needs_sponsorship,
        }
      : null;
    // Contact basics are the floor for a useful fill; without them, send the
    // user to settings rather than half-filling a form.
    if (!profileOut?.email && !profileOut?.phone) {
      return Response.json({
        status: "no_profile",
        settings_url: `${APP_ORIGIN}/app/settings`,
      });
    }

    const sb = supabaseAdmin();
    // Recent-N + normalize-compare in JS beats trying to express host/path
    // canonicalization in SQL; nobody has thousands of recent applications.
    const { data: apps } = await sb
      .from("job_applications")
      .select("id, job_url, job_json, resume_generation_id, application_qa, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const app = (apps ?? []).find((a) => a.job_url && jobUrlsMatch(url, a.job_url));

    // Resume: the application's linked generation, else the newest generation
    // whose job_url matches (a standalone tailor run for the same posting).
    let generationId: string | null = app?.resume_generation_id ?? null;
    let resume: TailoredResume | null = null;
    if (generationId) {
      const { data } = await sb
        .from("resume_generations")
        .select("id, resume")
        .eq("id", generationId)
        .eq("user_id", userId)
        .maybeSingle();
      resume = (data?.resume as TailoredResume | null) ?? null;
    }
    if (!resume) {
      const { data: gens } = await sb
        .from("resume_generations")
        .select("id, job_url, resume")
        .eq("user_id", userId)
        .not("job_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      const gen = (gens ?? []).find((g) => g.job_url && jobUrlsMatch(url, g.job_url));
      if (gen?.resume) {
        generationId = gen.id;
        resume = gen.resume as TailoredResume;
      }
    }

    if (!app && !resume) {
      return Response.json({
        status: "no_run",
        // ?seed= prefills the Desk's paste box (same affordance People uses).
        compose_url: `${APP_ORIGIN}/app/compose?seed=${encodeURIComponent(url)}`,
      });
    }

    const qa = (app?.application_qa ?? null) as ApplicationQA | null;
    const jobMeta = (app?.job_json ?? null) as Record<string, unknown> | null;

    return Response.json({
      status: "ok",
      application_id: app?.id ?? null,
      profile: profileOut,
      resume:
        resume && generationId
          ? { generation_id: generationId, filename: resumeFilename(resume, "pdf") }
          : null,
      answers: (qa?.answers ?? []).map((a) => ({ question: a.question, body: a.body })),
      job: {
        title: (jobMeta?.target_role as string | undefined) ?? resume?.meta?.target_role ?? null,
        company:
          (jobMeta?.target_company as string | undefined) ?? resume?.meta?.target_company ?? null,
      },
      submitted: app?.status === "submitted",
    });
  });
}
