// Pure shaping for the Jobs tab's "Your applications" section (goal mode).
// One job_applications row per Compose job run; the route joins its tailored
// résumé, its compose run and its hiring contact. Import-free.

export interface ApplicationRow {
  id: string;
  job_url: string | null;
  job_json: { role?: string | null; company?: string | null } | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
  application_qa: { questions?: unknown[]; answers?: unknown[] } | null;
  resume_generation: { target_role: string | null; target_company: string | null } | null;
}

export type ApplicationStage = "submitted" | "replied" | "drafted";

export interface ApplicationItem {
  id: string;
  role: string;
  company: string | null;
  job_url: string | null;
  stage: ApplicationStage;
  created_at: string;
  submitted_at: string | null;
  run_id: string | null; // the compose run that built the package, if found
  contact: string | null; // hiring contact's name
  questions: number;
  answers: number;
}

const clean = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim() : null);

// "drafted" | "sent" | "submitted" | "replied" (| "archived", filtered out
// upstream). "sent" is the outreach message, not the application — the
// application only counts as out once the extension confirms the submit.
export function applicationStage(status: string, submittedAt: string | null): ApplicationStage {
  if (status === "replied") return "replied";
  if (status === "submitted" || submittedAt) return "submitted";
  return "drafted";
}

export function applicationItem(
  row: ApplicationRow,
  extras: { run_id?: string | null; contact?: string | null } = {},
): ApplicationItem {
  const role = clean(row.job_json?.role) ?? clean(row.resume_generation?.target_role) ?? "Application";
  const company = clean(row.job_json?.company) ?? clean(row.resume_generation?.target_company);
  const qa = row.application_qa;
  return {
    id: row.id,
    role,
    company,
    job_url: clean(row.job_url),
    stage: applicationStage(row.status, row.submitted_at),
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    run_id: extras.run_id ?? null,
    contact: clean(extras.contact),
    questions: Array.isArray(qa?.questions) ? qa.questions.length : 0,
    answers: Array.isArray(qa?.answers) ? qa.answers.length : 0,
  };
}

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  drafted: "Ready to submit",
  submitted: "Submitted",
  replied: "Replied",
};

// Counts line beside the section label: "2 submitted · 1 ready to submit".
export function applicationsSummary(items: Pick<ApplicationItem, "stage">[]): string {
  if (!items.length) return "";
  const submitted = items.filter((a) => a.stage !== "drafted").length;
  const drafted = items.length - submitted;
  const parts: string[] = [];
  if (submitted) parts.push(`${submitted} submitted`);
  if (drafted) parts.push(`${drafted} ready to submit`);
  return parts.join(" · ");
}
