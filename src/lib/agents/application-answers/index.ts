import { answerApplicationQuestion } from "@/lib/claude";
import { getProfile, senderContextFromProfile } from "@/lib/profile";
import { listStoryEntries } from "@/lib/story";

// ─────────────────────── Sawaal Jawaab (application Q&A) ───────────────────────
//
// The fifth crew member. Given the essay questions an application asks (detected
// during the apply run, or pasted by the user), draft a full first-person answer
// to each — grounded in the applicant's own background (profile / resume /
// stories) and, for "why this company" prompts, current public facts about the
// company. Streams each answer as it lands so the UI fills in question by
// question, mirroring the reach-out agent's async-generator shape.

export interface RunApplicationAnswersInput {
  questions: string[];
  job_context?: { role?: string | null; company?: string | null } | null;
}

export type AnswerEvent =
  | { type: "answer"; status: "start"; index: number; question: string }
  | { type: "answer"; status: "done"; index: number; question: string; body: string; model: string }
  | { type: "answer"; status: "error"; index: number; question: string; message: string }
  | { type: "complete" }
  | { type: "error"; message: string };

// Yield the values of an array of promises as each settles (not in submission
// order). `wrapped[i]` is the exact promise we delete once its {i} comes back.
async function* streamSettled<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const wrapped = promises.map((p, i) => p.then((v) => ({ i, v })));
  const set = new Set(wrapped);
  while (set.size) {
    const { i, v } = await Promise.race(set);
    set.delete(wrapped[i]);
    yield v;
  }
}

export async function* runApplicationAnswersStream(
  input: RunApplicationAnswersInput,
): AsyncGenerator<AnswerEvent> {
  try {
    // Dedupe + bound the question list so a malformed payload can't fan out into
    // dozens of expensive calls.
    const seen = new Set<string>();
    const questions: string[] = [];
    for (const q of input.questions ?? []) {
      const s = (q ?? "").toString().trim();
      if (!s || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      questions.push(s);
    }
    if (!questions.length) {
      yield { type: "complete" };
      return;
    }

    // Assemble the applicant's background once and reuse it for every question.
    const profile = await getProfile();
    const senderContext = senderContextFromProfile(profile) || undefined;
    // Polished achievement bullets (fall back to the raw entry) as extra
    // grounding. Best-effort — a Story read failure just means less material.
    let stories: string[] = [];
    try {
      const entries = await listStoryEntries();
      stories = entries.map((e) => (e.bullet ?? e.raw)).filter((s): s is string => !!s && !!s.trim());
    } catch {
      stories = [];
    }

    for (let i = 0; i < questions.length; i++) {
      yield { type: "answer", status: "start", index: i, question: questions[i] };
    }

    const tasks = questions.map((question, index) =>
      answerApplicationQuestion({
        question,
        job_context: input.job_context ?? null,
        sender_context: senderContext,
        stories,
        sender_full_name: profile?.full_name ?? undefined,
      }).then(
        (r): AnswerEvent =>
          r.answer
            ? { type: "answer", status: "done", index, question, body: r.answer, model: r.model }
            : { type: "answer", status: "error", index, question, message: "empty answer" },
        (e): AnswerEvent => ({ type: "answer", status: "error", index, question, message: String(e) }),
      ),
    );

    for await (const evt of streamSettled(tasks)) {
      yield evt;
    }

    yield { type: "complete" };
  } catch (e) {
    yield { type: "error", message: String(e) };
  }
}
