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
  PostedWithin,
  MatchStatus,
} from "@/lib/db/schema";

export type { Ats, RemoteType, SizeBucket, VisaConfidence, PostedWithin, MatchStatus };

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
  company_size: SizeBucket | null;
  status: MatchStatus;
  is_new: boolean; // first_seen since the user's last visit / status === 'new'
}

// Full detail for one job + the viewer's match.
export interface JobDetail extends FeedItem {
  description: string | null; // JD text pulled from raw_json
  city: string | null;
  region: string | null;
  country: string | null;
}

// One row in the "New at companies you follow" strip. Recency-first (ordered by
// when WE first saw the listing), independent of fit score — the point is the
// company, not the match. `is_fresh` flags listings first seen within 24h.
export interface FollowingItem {
  job_id: string;
  title: string;
  company: string;
  company_id: string | null;
  location: string | null;
  posted_date: string | null;
  posted_date_approx: boolean;
  first_seen_at: string;
  is_fresh: boolean;
  url: string;
}

// A followed company, surfaced for management UIs / the strip's empty state.
export interface FollowedCompanyDTO {
  company_id: string;
  name: string;
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
  // Read-only echo of the profile's current_role, so the preferences UI can
  // show what "like my current title" resolves to (and prompt for a resume when
  // it's empty). Not persisted on the preferences row.
  current_role?: string | null;
  pins?: string[]; // user_profile.context_structured.target_companies (read-only echo)
}
