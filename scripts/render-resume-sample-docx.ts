// Build the .docx from the same fixture the PDF sample uses, so both exports can
// be eyeballed side by side. Dev aid, not part of the app:
//   npx tsx scripts/render-resume-sample-docx.ts [out.docx]
import { writeFileSync } from "node:fs";
import { sampleResume } from "./resume-sample-data.ts";
import { POST } from "../src/app/api/resume/docx/route.ts";

async function main() {
  const out = process.argv[2] ?? "sample-resume.docx";
  const req = new Request("http://localhost/api/resume/docx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume: sampleResume }),
  });
  const res = await POST(req as never);
  if (!res.ok) throw new Error(`docx route returned ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log("wrote", out, res.headers.get("content-disposition"));
}

main();
