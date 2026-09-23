import { NextRequest } from "next/server";
import { withUser } from "@/lib/auth";
import { renderResumePdf } from "@/lib/resume-pdf-render";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Anonymous (blur-gate) runs never produce a downloadable resume, so gating
  // this on a session closes the old unauthenticated export hole without
  // breaking any real caller.
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const resume = body?.resume as TailoredResume | undefined;
    if (!resume?.header?.full_name) {
      return Response.json({ error: "resume payload required" }, { status: 400 });
    }

    const { buf, filename } = await renderResumePdf(resume);

    // Product-analytics: a resume export is a key activation signal.
    void trackServer("resume_export", { format: "pdf" });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
