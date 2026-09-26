// Shared contracts for the Daily Job-Discovery Feed (Module 0).
//
// This file is the seam between modules: the fetch layer (M1), catalog resolver
// (M2), enrichment (M3), scoring (M4), API routes (M5), and frontend (M6) import
// from here instead of reading each other's internals. DB row types live in
// src/lib/db/schema.ts; this file holds the in-flight lib shapes + API DTOs.

import type {
  Ats,
  RemoteType,
  SizeBucket,
  VisaConfidence,
  VisaEvidence,
  H1bStats,
  PostedWithin,
  MatchStatus,
} from "@/lib/db/schema";

export type { Ats, RemoteType, SizeBucket, VisaConfidence, VisaEvidence, H1bStats, PostedWithin, MatchStatus };

// ── Fetch layer (M1) ─────────────────────────────────────────────────────────

// One listing normalized from any ATS into a single shape, ready to upsert into
// `jobs`. Enrichment columns (visa/company_size) are NOT set here — that's M3.
export interface NormalizedJob {
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
  posted_date: string | null; // ISO string or null
  posted_date_approx: boolean;
  url: string;
  raw_json: Record<string, unknown>;
}

// A company the orchestrator should fetch: the catalog row reduced to what an
// adapter needs.
export interface BoardTarget {
  company_id: string;
  name: string;
  ats: Ats;
  slug: string;
}

export interface FetchResult {
  inserted: number;
  updated: number;
  newJobIds: string[];
  errors: Array<{ company: string; ats: Ats; slug: string; error: string }>;
  attempted?: number; // boards fetched this call
  skipped?: number; // boards left for the next call (deadline hit)
}

// ── Catalog resolution (M2) ──────────────────────────────────────────────────

// An LLM-proposed company the resolver will validate before inserting. `slug` is
// a guess; validation against the live board decides if it's real.
export interface CatalogCandidate {
  company: string;
  ats: Ats;
  slug: string;
}

// ── Scoring (M4) ─────────────────────────────────────────────────────────────

export interface ScoreResult {
  job_id: string;
  score: number; // 0..100
  reasons: string; // one line
}

// ── API DTOs (M5 -> M6) ──────────────────────────────────────────────────────

// One row in the ranked feed: the match joined onto its job.
export interface FeedItem {
  match_id: string;
  job_id: string;
  title: string;
  company: string;
  company_id: string | null; // catalog id — lets the card follow the company
  location: string | null;
  remote_type: RemoteType;
  compensation: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  url: string;
  score: number;
  reasons: string | null;
  visa_confidence: VisaConfidence | null;
  visa_evidence: VisaEvidence | null;
  company_size: SizeBucket | null;
  status: MatchStatus;
  is_new: boolean; // first_seen since the user's last visit / status === 'new'
  // Why this employer is tracked ("Fortune 500 #12", "Top-100 H-1B sponsor");
  // empty for companies outside the curated universe.
  badges: string[];
}

// Full detail for one job + the viewer's match.
export interface JobDetail extends FeedItem {
  description: string | null; // JD text pulled from raw_json
  city: string | null;
  region: string | null;
  country: string | null;
}

// ── Company tracker ──────────────────────────────────────────────────────────

// One role at a tracked company. Recency is when WE first saw the listing
// (reliable and monotonic, unlike Greenhouse's approximate posted_date).
export interface TrackerJob {
  job_id: string;
  title: string;
  company: string;
  company_id: string;
  location: string | null;
  remote_type: RemoteType;
  compensation: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  first_seen_at: string;
  is_new: boolean; // first seen in the last 24h (or since the last digest)
  url: string;
}

// A tracked company with how many of its open roles fit the user's titles.
export interface TrackedCompany {
  company_id: string;
  name: string;
  badges: string[];
  open_count: number;
  new_count: number;
  last_checked_at: string | null;
}

// GET /api/jobs/tracker
export interface TrackerDTO {
  companies: TrackedCompany[];
  new_jobs: TrackerJob[]; // the last 24h, newest first
  open_jobs: TrackerJob[]; // everything else still open, newest first
  role_terms: string[]; // what titles are matched against ([] = every role)
  limit: number; // max companies per user
}

// A company the user can pick in tracker setup (search result or preset).
// `company_id` is null when we know the employer but can't track it yet (no
// supported job board found).
export interface TrackerCompanyOption {
  company_id: string | null;
  name: string;
  badge: string | null;
}

// GET /api/jobs/tracker/presets
export interface TrackerPreset {
  id: "profile" | "startups" | "sector" | "visa";
  label: string;
  companies: TrackerCompanyOption[];
}

// How the user wants roles matched: like their CURRENT title (read from the
// profile), or a DIFFERENT role they name in `target_roles`. `null` = not yet
// chosen (legacy rows / skipped onboarding).
export type RoleMode = "current" | "different" | null;

// GET/PUT /api/jobs/preferences body. Mirrors the job_preferences row minus
// server-managed columns. Pins are read from the profile, surfaced read-only.
export interface PreferencesDTO {
  interests: string[];
  posted_within: PostedWithin;
  company_sizes: SizeBucket[];
  locations: string[];
  visa_required: boolean;
  // Role targeting (see 0016 migration). `role_mode` chooses the matching axis;
  // `target_roles` holds the desired titles when role_mode === "different".
  role_mode: RoleMode;
  target_roles: string[];
  // Opt-out for the daily new-matches email (cron/jobs-email). Defaults true.
  daily_email?: boolean;
  // Company universe (0029): also scan the curated employer list for
  // title-matching roles (default true); let IT staffing firms in (default false).
  include_universe?: boolean;
  include_staffing?: boolean;
  // Read-only echo of the profile's current_role, so the preferences UI can
  // show what "like my current title" resolves to (and prompt for a resume when
  // it's empty). Not persisted on the preferences row.
  current_role?: string | null;
  pins?: string[]; // user_profile.context_structured.target_companies (read-only echo)
}
