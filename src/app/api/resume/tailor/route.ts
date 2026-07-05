import { NextRequest } from "next/server";
import { runResumeTailorStreamPersisted } from "@/lib/agents/resume-tailor/persisted";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { assertAnonRunAllowed } from "@/lib/anon-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // A null userId is an anonymous blur-gate run: the tailor persists nothing.
  // (A signed-out visitor has no base resume on file, so the tailor will yield
  // its honest "no resume" error rather than a teaser — an inherent limitation,
  // not a regression.) Cap anonymous compute first.
  const userId = await resolveUserId();
  if (!userId) {
    const limited = await assertAnonRunAllowed(req);
    if (limited) return limited;
  }

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

  // The persisted stream owns the resume_generations lifecycle: it inserts an
  // in_flight row up front (yielded as `resume_run` for client recovery),
  // finalizes it even if this connection dies, and emits `saved` only after
  // the row has settled — so a post-run history fetch always sees the result.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
        // Guarded enqueue: once the client disconnects (navigated away, locked
        // phone) enqueue throws. Swallow it so the tailor keeps running to
        // completion and still persists — the client recovers by polling the
        // generation row.
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // stream already closed/cancelled — drop the event, keep working
          }
        };

        try {
          for await (const evt of runResumeTailorStreamPersisted({
            job_url: job_url || undefined,
            highlights,
            page_count,
            regenerate_notes,
          })) {
            send(evt);
          }
        } catch (e) {
          send({ type: "error", message: String(e instanceof Error ? e.message : e) });
        }

        // Guard against a double/late close throwing on a disconnected stream.
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
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
