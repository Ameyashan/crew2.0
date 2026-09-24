import { renderToBuffer } from "@react-pdf/renderer";
import { ResumeDoc } from "@/components/resume/ResumeDoc";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

// Shared by /api/resume/pdf (web download) and /api/ext/resume-pdf (extension
// autofill attach) so both always render the identical document.
export async function renderResumePdf(
  resume: TailoredResume,
): Promise<{ buf: Buffer; filename: string }> {
  const buf = await renderToBuffer(<ResumeDoc resume={resume} />);
  return { buf, filename: resumeFilename(resume, "pdf") };
}

export function resumeFilename(r: TailoredResume, ext: "pdf" | "docx"): string {
  const name = (r.header.full_name || "resume")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const role = (r.meta.target_role || "")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return [name, role || null, "resume"].filter(Boolean).join("-").toLowerCase() + "." + ext;
}
