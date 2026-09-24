// API serializers (Module 5): turn DB rows into the wire DTOs the frontend reads.

import { jdText } from "@/lib/jobs/util";
import { universeBadges, type UniverseBadgeInput } from "@/lib/jobs/universe/classify";
import type { Job, JobMatch } from "@/lib/db/schema";
import type {
  FeedItem,
  JobDetail,
  MatchStatus,
  RemoteType,
  SizeBucket,
  VisaConfidence,
  VisaEvidence,
} from "@/lib/jobs/types";

// The shape of a job_matches row with its job embedded (PostgREST !inner join).
export interface FeedJoinRow {
  id: string;
  score: number;
  reasons: string | null;
  status: MatchStatus;
  jobs: {
    id: string;
    company_id: string | null;
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
    visa_confidence: VisaConfidence | null;
    visa_evidence: VisaEvidence | null;
    company_size: SizeBucket | null;
    // Catalog row + its curated-universe entry (list membership → badges).
    companies?: CompanyEmbed | null;
  } | null;
}

// PostgREST embed shape for jobs → companies → company_universe.
export interface CompanyEmbed {
  org_type: string | null;
  company_universe: UniverseBadgeInput | null;
}

// Select fragment matching CompanyEmbed, for routes that serialize jobs.
export const COMPANY_EMBED =
  "companies(org_type, company_universe(in_fortune500, in_top_startups, in_top_h1b, fortune_rank, startup_rank, valuation_busd, h1b_rank))";

export function jobLocation(j: {
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}): string | null {
  if (j.location_raw) return j.location_raw;
  const parts = [j.city, j.region, j.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function feedItemFromJoin(row: FeedJoinRow): FeedItem | null {
  const j = row.jobs;
  if (!j) return null;
  return {
    match_id: row.id,
    job_id: j.id,
    title: j.title,
    company: j.company,
    company_id: j.company_id,
    location: jobLocation(j),
    remote_type: j.remote_type,
    compensation: j.compensation,
    posted_date: j.posted_date,
    posted_date_approx: j.posted_date_approx,
    url: j.url,
    score: row.score,
    reasons: row.reasons,
    visa_confidence: j.visa_confidence,
    visa_evidence: j.visa_evidence,
    company_size: j.company_size,
    status: row.status,
    is_new: row.status === "new",
    badges: universeBadges(j.companies?.company_universe),
  };
}

export function jobDetail(job: Job, match: JobMatch | null, company?: CompanyEmbed | null): JobDetail {
  return {
    match_id: match?.id ?? "",
    job_id: job.id,
    title: job.title,
    company: job.company,
    company_id: job.company_id,
    location: jobLocation(job),
    remote_type: job.remote_type,
    compensation: job.compensation,
    posted_date: job.posted_date,
    posted_date_approx: job.posted_date_approx,
    url: job.url,
    score: match?.score ?? 0,
    reasons: match?.reasons ?? null,
    visa_confidence: job.visa_confidence,
    visa_evidence: job.visa_evidence,
    company_size: job.company_size,
    status: match?.status ?? "new",
    is_new: match?.status === "new",
    badges: universeBadges(company?.company_universe),
    description: jdText(job.ats, job.raw_json),
    city: job.city,
    region: job.region,
    country: job.country,
  };
}
