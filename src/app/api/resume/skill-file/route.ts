import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Streams a file the resume-writer skill generated inside the code-execution
// container. The file_id arrives on the tailor SSE stream as an `artifact`
// event and is persisted in resume_generations.meta.artifacts.
export async function GET(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get("file_id")?.trim();
  if (!fileId) return Response.json({ error: "file_id required" }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const client = new Anthropic({ apiKey: key });
  const betas: Anthropic.Beta.AnthropicBeta[] = ["files-api-2025-04-14"];

  let filename = "resume";
  let contentType = "application/octet-stream";
  try {
    const meta = await client.beta.files.retrieveMetadata(fileId, { betas });
    if (meta?.filename) filename = meta.filename;
    if (meta?.mime_type) contentType = meta.mime_type;
  } catch {
    // metadata is best-effort — fall back to a generic name/type
  }

  let resp: Response;
  try {
    resp = await client.beta.files.download(fileId, { betas });
  } catch (e) {
    return Response.json({ error: `download failed: ${String(e)}` }, { status: 502 });
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  // Keep the filename header-safe; never let a remote name break the response.
  const safe = filename.replace(/[^\w.\- ]+/g, "_") || "resume";
  return new Response(buf, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
