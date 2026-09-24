import { NextRequest } from "next/server";
import { withExtensionToken } from "@/lib/ext-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { renderResumePdf } from "@/lib/resume-pdf-render";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// By-id PDF for the extension to attach to an application's file input. Unlike
// the web export (which takes the resume JSON it already holds), the extension
// only knows the generation id from /api/ext/package.
export async function GET(req: NextRequest) {
  return withExtensionToken(req, async (userId) => {
    const generationId = req.nextUrl.searchParams.get("generation_id") ?? "";
    if (!generationId) {
      return Response.json({ error: "generation_id required" }, { status: 400 });
    }

    const { data } = await supabaseAdmin()
      .from("resume_generations")
      .select("resume")
      .eq("id", generationId)
      .eq("user_id", userId)
      .maybeSingle();
    const resume = (data?.resume as TailoredResume | null) ?? null;
    if (!resume?.header?.full_name) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    const { buf, filename } = await renderResumePdf(resume);
    void trackServer("resume_export", { format: "pdf", surface: "extension" });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
