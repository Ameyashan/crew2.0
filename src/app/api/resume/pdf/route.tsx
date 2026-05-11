import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ResumeDoc } from "@/components/resume/ResumeDoc";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const resume = body?.resume as TailoredResume | undefined;
  if (!resume?.header?.full_name) {
    return Response.json({ error: "resume payload required" }, { status: 400 });
  }

  const buf = await renderToBuffer(<ResumeDoc resume={resume} />);
  const filename = filenameFor(resume, "pdf");

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function filenameFor(r: TailoredResume, ext: "pdf" | "docx") {
  const name = (r.header.full_name || "resume").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
  const role = (r.meta.target_role || "").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
  return [name, role || null, "resume"].filter(Boolean).join("-").toLowerCase() + "." + ext;
}
