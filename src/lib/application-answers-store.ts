import { supabaseAdmin } from "@/lib/supabase";
import type { ApplicationAnswer, ApplicationQA } from "@/lib/db/schema";

// Persistence for drafted Sawaal Jawaab answers, shared by the web app's
// /api/compose/answers and the extension's /api/ext/answers.

// Merge a fresh answer set into an existing one, keyed by question (case/space
// insensitive) so a re-draft replaces the prior answer rather than duplicating.
function mergeAnswers(existing: ApplicationAnswer[], incoming: ApplicationAnswer[]): ApplicationAnswer[] {
  const byKey = new Map<string, ApplicationAnswer>();
  for (const a of existing) byKey.set(a.question.trim().toLowerCase(), a);
  for (const a of incoming) byKey.set(a.question.trim().toLowerCase(), a);
  return [...byKey.values()];
}

export async function persistAnswers(opts: {
  userId: string;
  composeRunId: string | null;
  jobApplicationId: string | null;
  questions: string[];
  answers: ApplicationAnswer[];
}) {
  const sb = supabaseAdmin();

  // job_applications.application_qa — the durable per-application record.
  if (opts.jobApplicationId) {
    const { data } = await sb
      .from("job_applications")
      .select("application_qa")
      .eq("id", opts.jobApplicationId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    const prior = (data?.application_qa as ApplicationQA | null) ?? null;
    const merged: ApplicationQA = {
      questions: prior?.questions?.length ? prior.questions : opts.questions,
      answers: mergeAnswers(prior?.answers ?? [], opts.answers),
    };
    await sb
      .from("job_applications")
      .update({ application_qa: merged })
      .eq("id", opts.jobApplicationId)
      .eq("user_id", opts.userId);
  }

  // compose_runs.output.answers — what the history detail view rebuilds from.
  if (opts.composeRunId) {
    const { data } = await sb
      .from("compose_runs")
      .select("output")
      .eq("id", opts.composeRunId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    const output = (data?.output as Record<string, unknown> | null) ?? {};
    const priorAnswers = Array.isArray(output.answers) ? (output.answers as ApplicationAnswer[]) : [];
    const priorQuestions = Array.isArray(output.questions) ? (output.questions as string[]) : opts.questions;
    await sb
      .from("compose_runs")
      .update({
        output: {
          ...output,
          questions: priorQuestions.length ? priorQuestions : opts.questions,
          answers: mergeAnswers(priorAnswers, opts.answers),
        },
      })
      .eq("id", opts.composeRunId)
      .eq("user_id", opts.userId);
  }
}
