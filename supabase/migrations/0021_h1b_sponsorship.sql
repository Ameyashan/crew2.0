-- H-1B sponsorship track record (Phase 1: USCIS Employer Data Hub).
--
-- Upgrades the jobs feed's visa signal from an LLM guess over JD text to
-- evidence from public USCIS filing data:
--   h1b_employer_records  GLOBAL  raw rows from the USCIS H-1B Employer Data Hub
--                                 annual exports (one row per employer/FY/location
--                                 as published; aggregation happens in code).
--   companies             +cols   matched USCIS legal names + a precomputed
--                                 filing-stats rollup, filled by the matcher
--                                 (src/lib/jobs/h1b/match.ts).
--   jobs                  +col    visa_evidence snapshot denormalized at
--                                 enrichment time (same pattern as company_size),
--                                 and a widened visa_confidence CHECK.
--
-- Ingestion is idempotent per fiscal year: the ingest pass deletes that FY's
-- rows and re-inserts, so there is no unique constraint (the published files
-- repeat an employer across locations, with nullable location columns).

create table if not exists h1b_employer_records (
  id                   uuid primary key default gen_random_uuid(),
  employer_name        text not null,                    -- legal name as published, e.g. "AMAZON.COM SERVICES LLC"
  normalized_name      text not null,                    -- match key; see normalizeEmployerName()
  fiscal_year          integer not null,
  initial_approvals    integer not null default 0,       -- first-time (incl. lottery) petitions approved
  initial_denials      integer not null default 0,
  continuing_approvals integer not null default 0,       -- transfers / extensions / amendments approved
  continuing_denials   integer not null default 0,
  state                text,
  city                 text,
  zip                  text,
  naics                text,
  created_at           timestamptz not null default now()
);

create index if not exists h1b_records_normalized_idx on h1b_employer_records(normalized_name);
create index if not exists h1b_records_fy_idx on h1b_employer_records(fiscal_year);

-- Global reference data: RLS enabled with NO policy, service-role reads only
-- (same model as companies / jobs in 0010_jobs_feed.sql).
alter table public.h1b_employer_records enable row level security;

-- ── companies: matched names + stats rollup ──────────────────────────────────
alter table companies add column if not exists h1b_employer_names text[] not null default '{}';
alter table companies add column if not exists h1b_stats jsonb;          -- H1bStats in src/lib/db/schema.ts
alter table companies add column if not exists h1b_matched_at timestamptz;

-- ── jobs: widened confidence + evidence snapshot ─────────────────────────────
-- 'sponsors_verified'  = USCIS-backed (company has recent filings).
-- 'no_sponsorship'     = reserved for the Phase 3 negative signal; the UI already
--                        renders it (format.ts visaKind) but nothing emits it yet.
alter table jobs drop constraint if exists jobs_visa_confidence_check;
alter table jobs add constraint jobs_visa_confidence_check
  check (visa_confidence in ('sponsors_verified','likely_sponsors','unclear','no_sponsorship'));

alter table jobs add column if not exists visa_evidence jsonb;           -- VisaEvidence in src/lib/db/schema.ts
