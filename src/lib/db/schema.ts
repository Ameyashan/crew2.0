// Types mirror supabase/migrations/0001_init.sql.
// Edit migrations first, then update these.

export type Channel = "email" | "x_dm" | "linkedin";

export type DraftStatus = "generated" | "edited" | "sent" | "discarded";

export type InteractionType =
  | "drafted"
  | "sent"
  | "replied"
  | "no_reply"
  | "clicked"
  | "followed_up";

export type FollowupStatus = "pending" | "sent" | "cancelled";

export interface Person {
  id: string;
  user_id: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  email_confidence: number | null;
  email_source: string | null;
  links: Record<string, string>;
  enrichment: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  id: string;
  user_id: string;
  person_id: string | null;
  channel: Channel;
  subject: string | null;
  body: string;
  intent: string | null;
  status: DraftStatus;
  model: string | null;
  parent_draft_id: string | null;
  compose_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ComposeRunKind = "person" | "job";
export type ComposeRunOutcome =
  | "complete"
  | "error"
  | "needs_disambiguation"
  | "in_flight";

export interface ComposeRun {
  id: string;
  user_id: string;
  kind: ComposeRunKind;
  input: string;
  intent: string | null;
  provided_email: string | null;
  screenshot_id: string | null;
  picked: Record<string, unknown> | null;
  person_id: string | null;
  output: Record<string, unknown>;
  resume_generation_id: string | null;
  outcome: ComposeRunOutcome;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Interaction {
  id: string;
  user_id: string;
  person_id: string | null;
  agent_type: string;
  interaction_type: InteractionType;
  channel: Channel | null;
  draft_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Followup {
  id: string;
  user_id: string;
  person_id: string | null;
  source_interaction_id: string | null;
  draft_id: string | null;
  due_at: string;
  status: FollowupStatus;
  created_at: string;
  updated_at: string;
}

export interface VoiceSample {
  id: string;
  user_id: string;
  channel: Channel | null;
  body: string;
  source: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AgentRun {
  id: string;
  user_id: string;
  agent_type: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  outcome: string | null;
  error: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DailyDigest {
  id: string;
  user_id: string;
  generated_at: string;
  pending_followups: number;
  pending_reviews: number;
  snapshot: Record<string, unknown>;
}

// ── Daily Job-Discovery Feed (mirrors 0010_jobs_feed.sql) ────────────────────

export type Ats = "greenhouse" | "lever" | "ashby";
export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";
export type SizeBucket = "large" | "medium" | "startup";
export type VisaConfidence = "likely_sponsors" | "unclear";
export type CompanySource = "seed" | "llm_resolved";
export type PostedWithin = "24h" | "1wk" | "1mo" | "any";
export type MatchStatus = "new" | "seen" | "dismissed" | "outreach_started";

export interface Company {
  id: string;
  name: string;
  normalized: string;
  ats: Ats;
  slug: string;
  sectors: string[];
  size_bucket: SizeBucket | null;
  source: CompanySource;
  added_by: string | null;
  verified_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  company_id: string | null;
  ats: Ats;
  external_job_id: string;
  title: string;
  company: string;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote_type: RemoteType;
  compensation: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  url: string;
  source: string;
  raw_json: Record<string, unknown>;
  visa_confidence: VisaConfidence | null;
  company_size: SizeBucket | null;
  enriched_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobPreferences {
  user_id: string;
  interests: string[];
  posted_within: PostedWithin;
  company_sizes: SizeBucket[];
  locations: string[];
  visa_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobMatch {
  id: string;
  user_id: string;
  job_id: string;
  score: number;
  reasons: string | null;
  status: MatchStatus;
  scored_at: string;
}

// ── Story (mirrors 0012_story_entries.sql) ───────────────────────────────────
// The living record behind every resume: raw first-person notes the résumé
// agent polishes into resume-ready bullets the user approves.
//   raw      — captured, no polish requested/kept
//   pending  — polish in flight (agent is working on it)
//   proposed — a resume-ready bullet is waiting for the user to approve/reject
//   polished — the proposed bullet was approved and is now the canonical line
export type StoryStatus = "pending" | "proposed" | "polished" | "raw";

export interface StoryEntry {
  id: string;
  user_id: string;
  raw: string;
  bullet: string | null;
  status: StoryStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}
