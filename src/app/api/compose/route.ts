import { NextRequest } from "next/server";
import { runReachOutStream, type RunReachOutInput } from "@/lib/agents/reach-out";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function parseInput(req: NextRequest): Promise<
  { input: RunReachOutInput } | { error: string; status: number }
> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const text = (form.get("text") ?? "").toString();
    const intent = form.get("intent");
    const pickedRaw = form.get("picked");
    const image = form.get("intent_image");
    const providedEmail = form.get("provided_email");

    let picked: RunReachOutInput["picked"] | undefined;
    if (typeof pickedRaw === "string" && pickedRaw.trim()) {
      try {
        picked = JSON.parse(pickedRaw);
      } catch {
        return { error: "invalid picked json", status: 400 };
      }
    }

    let intent_image: RunReachOutInput["intent_image"];
    if (image instanceof File && image.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
        return { error: `unsupported image type: ${image.type}`, status: 415 };
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return { error: "image exceeds 5MB limit", status: 413 };
      }
      const data = Buffer.from(await image.arrayBuffer()).toString("base64");
      intent_image = { data, media_type: image.type };
    }

    return {
      input: {
        text,
        intent: typeof intent === "string" && intent ? intent : undefined,
        picked,
        intent_image,
        provided_email:
          typeof providedEmail === "string" && providedEmail.trim()
            ? providedEmail.trim()
            : undefined,
      },
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    input: {
      text: (body?.text ?? "").toString(),
      intent: body?.intent ? body.intent.toString() : undefined,
      picked:
        body?.picked && typeof body.picked === "object" ? body.picked : undefined,
      provided_email:
        typeof body?.provided_email === "string" && body.provided_email.trim()
          ? body.provided_email.trim()
          : undefined,
    },
  };
}

export async function POST(req: NextRequest) {
  const parsed = await parseInput(req);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const { input } = parsed;
  if (!input.text.trim()) {
    return Response.json({ error: "empty input" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of runReachOutStream(input)) {
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
