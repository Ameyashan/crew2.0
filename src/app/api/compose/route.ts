import { NextRequest } from "next/server";
import { runReachOutStream } from "@/lib/agents/reach-out";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = (body?.text ?? "").toString();
  const intent = body?.intent ? body.intent.toString() : undefined;
  const picked = body?.picked && typeof body.picked === "object" ? body.picked : undefined;
  if (!text.trim()) {
    return Response.json({ error: "empty input" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of runReachOutStream({ text, intent, picked })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`
          )
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
