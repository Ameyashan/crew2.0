import { NextRequest } from "next/server";
import { withExtensionToken } from "@/lib/ext-auth";
import { runApplicationAnswersStream } from "@/lib/agents/application-answers";
import { persistAnswers } from "@/lib/application-answers-store";
import type { ApplicationAnswer } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/ext/answers { questions, application_id?, job? }
//
// Sawaal Jawaab for the extension: the apply run only records which essay
// questions a form asks (answers are drafted on demand in the Desk), so when
// the extension meets an essay box with no drafted answer it asks here. Drafts
// every question in parallel, answers in one JSON response (the service worker
// can't usefully relay SSE), and saves them onto the application so a re-fill
// reuses them.
export async function POST(req: NextRequest) {
  return withExtensionToken(req, async (userId) => {
    const body = await req.json().catch(() => ({}));
    const questions: string[] = Array.isArray(body?.questions)
      ? body.questions
          .map((q: unknown) => (q ?? "").toString().trim().slice(0, 1000))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    if (!questions.length) {
      return Response.json({ error: "questions is required" }, { status: 400 });
    }
    const jobApplicationId = body?.application_id ? body.application_id.toString() : null;
    const job = body?.job
      ? {
          role: body.job.title ? body.job.title.toString() : null,
          company: body.job.company ? body.job.company.toString() : null,
        }
      : null;

    const answers: ApplicationAnswer[] = [];
    for await (const evt of runApplicationAnswersStream({ questions, job_context: job })) {
      if (evt.type === "answer" && evt.status === "done") {
        answers.push({ question: evt.question, body: evt.body, model: evt.model });
      }
    }

    if (answers.length && jobApplicationId) {
      // persistAnswers scopes the update to this user's own row.
      await persistAnswers({ userId, composeRunId: null, jobApplicationId, questions, answers }).catch(
        (e) => console.error("[ext/answers] persist failed", e),
      );
    }

    return Response.json({
      ok: true,
      answers: answers.map((a) => ({ question: a.question, body: a.body })),
    });
  });
}
