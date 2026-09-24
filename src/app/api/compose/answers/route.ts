import { NextRequest } from "next/server";
import { runApplicationAnswersStream } from "@/lib/agents/application-answers";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { persistAnswers } from "@/lib/application-answers-store";
import type { ApplicationAnswer } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

// POST /api/compose/answers { questions, job_context?, compose_run_id?, job_application_id? }
//
// Sawaal Jawaab, on demand. Given the essay questions detected during the apply
// run (or pasted by the user), draft a full first-person answer to each, grounded
// in the applicant's profile / resume / stories. Streams one SSE event per answer
// as it lands, then persists the set onto the job_applications row and the
// compose_runs.output bundle so /app/history can rebuild the card.
export async function POST(req: NextRequest) {
  // Answers are grounded in the signed-in user's profile — no anonymous path.
  const userId = await resolveUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const questions: string[] = Array.isArray(body?.questions)
    ? body.questions.map((q: unknown) => (q ?? "").toString().trim()).filter(Boolean).slice(0, 8)
    : [];
  const jobContext = body?.job_context
    ? {
        role: body.job_context.role ? body.job_context.role.toString() : null,
        company: body.job_context.company ? body.job_context.company.toString() : null,
      }
    : null;
  const composeRunId = body?.compose_run_id ? body.compose_run_id.toString() : null;
  const jobApplicationId = body?.job_application_id ? body.job_application_id.toString() : null;

  if (!questions.length) {
    return Response.json({ error: "questions is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // Client navigated away / cancelled — drop the event.
          }
        };

        const answers: ApplicationAnswer[] = [];
        try {
          for await (const evt of runApplicationAnswersStream({ questions, job_context: jobContext })) {
            if (evt.type === "answer" && evt.status === "done") {
              answers.push({ question: evt.question, body: evt.body, model: evt.model });
            }
            send(evt);
          }
        } catch (e) {
          send({ type: "error", message: String(e) });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
          // Persist the drafted answers (best-effort; the client already has them
          // from the stream). Merge by question so re-drafting replaces cleanly.
          if (answers.length) {
            await persistAnswers({ userId, composeRunId, jobApplicationId, questions, answers }).catch(
              (e) => console.error("[compose/answers] persist failed", e),
            );
          }
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
