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
    bullets: string[];
  }[];
  education: {
    school: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
    notes?: string[];
  }[];
  skills?: { group: string; items: string[] }[];
  projects?: { name: string; link?: string; bullets: string[] }[];
  extras?: { heading: string; items: string[] }[];
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
