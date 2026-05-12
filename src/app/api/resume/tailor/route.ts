import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const highlights = body?.highlights ? body.highlights.toString() : undefined;
  const regenerate_notes = body?.regenerate_notes
    ? body.regenerate_notes.toString()
    : undefined;
  const pageRaw = Number(body?.page_count);
  const page_count: 1 | 2 = pageRaw === 2 ? 2 : 1;

  if (!job_url && !highlights?.trim()) {
    return Response.json(
      { error: "Provide a job URL or a description of how to change the resume" },
      { status: 400 }
    );
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of runResumeTailorStream({
          job_url: job_url || undefined,
          highlights,
          page_count,
          regenerate_notes,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
