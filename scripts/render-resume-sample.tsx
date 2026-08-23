// Render the real <ResumeDoc> to a PDF so the typography can be measured against
// the design it was built to match. Not part of the app — a dev aid:
//   npx tsx scripts/render-resume-sample.tsx [out.pdf]
import { renderToFile } from "@react-pdf/renderer";
import { ResumeDoc } from "../src/components/resume/ResumeDoc";
import { sampleResume } from "./resume-sample-data.ts";

async function main() {
  const out = process.argv[2] ?? "sample-resume.pdf";
  await renderToFile(<ResumeDoc resume={sampleResume} />, out);
  console.log("wrote", out);
}

main();
