// One honest entry in the tailoring changelog: a single edit the agent made to
// fit the resume to this job, so the user can see what changed and why.
export type ResumeChangeKind =
  | "rewrote" // same fact, new wording
  | "added" // surfaced something already true but buried in the source resume
  | "reordered" // moved earlier for relevance
  | "emphasized" // pulled a JD keyword/skill forward
  | "dropped"; // trimmed for space or focus

export type ResumeChange = {
  section: string; // where on the resume, e.g. "Summary", "Experience · Goldman Sachs"
  kind: ResumeChangeKind;
  before?: string; // original phrasing (omitted for "added")
  after?: string; // new phrasing (omitted for "dropped")
  reason: string; // one short clause tying the edit to the JD
};

// One stint inside a single employer. Big-company careers routinely stack
// several distinct assignments under one company header — a product lead moves
// from one desk to another without changing employer — and flattening them into
// a single bullet list loses the shape of the career. Each track carries its own
// sub-title, its own one-line framing, and its own bullets.
export type ResumeTrack = {
  title: string; // e.g. "Liquidity Risk: Unsecured Funding Lead"
  context?: string; // Title Case outcome framing, rendered italic + centered
  bullets: string[]; // may carry **bold** spans (see lib/writing/inline-markup)
};

// A dated role inside an `extras` section — what carries "Entrepreneurial
// Ventures", which reads like a mini experience section rather than a list of
// one-line items.
export type ExtraRole = {
  role: string;
  org?: string;
  location?: string;
  start?: string;
  end?: string;
  context?: string; // italic, centered description of the venture
  bullets: string[];
};

export type TailoredResume = {
  header: {
    full_name: string;
    headline: string;
    location?: string;
    email?: string;
    phone?: string;
    links?: { linkedin?: string; github?: string; website?: string };
  };
  summary?: string;
  experience: {
    company: string;
    role: string;
    location?: string;
    start: string;
    end: string;
    // Flat bullet list for a single-stint role. Ignored by every renderer when
    // `tracks` is present; kept populated for older saved resumes and as the
    // fallback the model uses when an employer really was one job.
    bullets: string[];
    tracks?: ResumeTrack[];
  }[];
  education: {
    school: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
    // GPA and coursework get their own typeset lines (right-aligned italic and a
    // bold-labelled run) rather than being demoted to bullets.
    gpa?: string;
    coursework?: string;
    notes?: string[];
  }[];
  skills?: { group: string; items: string[] }[];
  projects?: { name: string; link?: string; bullets: string[] }[];
  // `roles` wins over `items` when present, the same way `tracks` wins over
  // `bullets`. Old saved resumes only ever have `items`.
  extras?: { heading: string; items: string[]; roles?: ExtraRole[] }[];
  // The most significant edits the agent made to tailor this resume to the JD,
  // most impactful first. Omitted when the JD/brief wasn't seen.
  changes?: ResumeChange[];
  meta: {
    target_role?: string;
    target_company?: string;
    team?: string | null; // team/department/org the role sits in, from the JD
    job_url?: string;
    page_count: 1 | 2;
    model: string;
    generated_at: string;
    ats_score?: number; // 0-100, tailored resume self-scored against the JD; null when JD wasn't reachable
    ats_score_before?: number; // 0-100, the ORIGINAL resume scored against the same JD (the baseline before tailoring)
    skill_id?: string | null; // the resume-writer Agent Skill used to shape this resume, if any
    // Files the skill wrote inside the code-execution container (e.g. a formatted
    // .docx/.pdf). Downloadable via /api/resume/skill-file?file_id=…
    artifacts?: { file_id: string; filename?: string }[];
  };
};

export interface ResumeTailorInput {
  job_url?: string;
  highlights?: string;
  page_count: 1 | 2;
  regenerate_notes?: string;
  // A job posting read directly from an ATS (Greenhouse/Lever) rather than via
  // web_search. When present the tailor reads THIS exact posting — it never
  // guesses which opening the URL points to. Auto-populated from job_url inside
  // runResumeTailorStream when the URL is a known ATS board.
  job_posting?: {
    title?: string | null;
    company?: string | null;
    team?: string | null;
    text: string;
  } | null;
}

export type ResumeTailorStepEvent =
  | { type: "step"; id: "research"; status: "start" }
  | {
      type: "step";
      id: "research";
      status: "done";
      data: { job_title?: string; company?: string };
    }
  | { type: "step"; id: "tailor"; status: "start" }
  | {
      type: "step";
      id: "tailor";
      status: "done";
      data: { resume: TailoredResume };
    }
  | { type: "tool"; name: "web_search"; query: string }
  | { type: "tool"; name: "skill" }
  | { type: "progress"; chars: number; bullets: number }
  | { type: "artifact"; file_id: string; filename?: string }
  | { type: "saved"; id: string }
  | { type: "complete" }
  | { type: "error"; message: string };

// The résumé length we target when the user hasn't picked one. Two pages is the
// default because the template is dense enough that a real career (several
// employers, multiple stints under one of them) does not fit honestly on one —
// squeezing it to a page costs bullets that carry the strongest evidence.
export const DEFAULT_RESUME_PAGES: 1 | 2 = 2;

// Coerce anything user- or DB-supplied into a valid page count, defaulting to
// DEFAULT_RESUME_PAGES. Callers used to spell this `=== 2 ? 2 : 1` inline, which
// hard-coded the old 1-page default in six places.
export function coercePageCount(v: unknown): 1 | 2 {
  const n = Number(v);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return DEFAULT_RESUME_PAGES;
}
