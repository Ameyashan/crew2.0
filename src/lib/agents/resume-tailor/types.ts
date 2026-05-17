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
  meta: {
    target_role?: string;
    target_company?: string;
    job_url?: string;
    page_count: 1 | 2;
    model: string;
    generated_at: string;
    ats_score?: number; // 0-100, self-scored against the JD; null when JD wasn't reachable
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
  | { type: "progress"; chars: number; bullets: number }
  | { type: "saved"; id: string }
  | { type: "complete" }
  | { type: "error"; message: string };
