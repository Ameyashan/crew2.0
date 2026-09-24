-- Company universe: the curated list of employers the jobs feed tracks.
--
-- Source: data/company-universe.csv (Fortune 500 ∪ top-500 startups ∪ top-500
-- H-1B sponsors, ~1.3k employers after folding subsidiaries). Rows are loaded
-- by the generated seed migration 0027 (scripts/build-company-universe.ts).
--
--   company_universe  GLOBAL  one row per employer: list membership + ranks
--                             (feed badges), USCIS petitioning entities (H-1B
--                             matching), org type (staffing firms are excluded
--                             by default), interest sectors, and the state of
--                             resolving the employer to a scannable job board.
--   companies         +cols   universe_id links a scannable board back to its
--                             universe row; org_type is denormalized so
--                             candidate selection can filter without a 2-hop
--                             embed.
--
-- A universe row with no board yet is NOT in `companies` (whose ats/slug are
-- NOT NULL) — the resolver (src/lib/jobs/universe/resolve.ts) works the
-- pending rows down in bounded batches and inserts a companies row when it
-- verifies a board.

create table if not exists company_universe (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                          -- cleaned display name
  match_key          text not null unique,                   -- normalizeEmployerName(name)
  aliases            text[] not null default '{}',           -- raw sheet names folded into this row
  in_fortune500      boolean not null default false,
  in_top_startups    boolean not null default false,
  in_top_h1b         boolean not null default false,
  fortune_rank       integer,
  revenue_musd       numeric,
  startup_rank       integer,
  valuation_busd     numeric,
  investors          text,
  h1b_rank           integer,
  h1b_approvals      integer,
  h1b_entities       text[] not null default '{}',           -- USCIS petitioning entity names, as listed
  industry           text,
  hq                 text,
  org_type           text not null default 'company'
                       check (org_type in ('company','staffing','academic','hospital')),
  sectors            text[] not null default '{}',           -- interest tags (catalog/sectors.ts)
  size_bucket        text check (size_bucket in ('large','medium','startup')),
  -- board resolution
  resolve_status     text not null default 'pending'
                       check (resolve_status in ('pending','resolved','unresolved')),
  resolve_attempts   integer not null default 0,
  resolve_note       text,                                   -- last outcome, for operators
  probed_at          timestamptz,                            -- slug probe (GH/Lever/Ashby) already ran
  next_resolve_at    timestamptz,                            -- retry backoff for unresolved rows
  resolved_at        timestamptz,
  sectors_refined_at timestamptz,                            -- LLM sector pass ran (universe/sectors.ts)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists company_universe_resolve_idx on company_universe(resolve_status, next_resolve_at);

-- Global reference data: RLS on, no policy → service-role reads only (same
-- model as companies / jobs in 0010_jobs_feed.sql).
alter table public.company_universe enable row level security;

-- ── companies: link + denormalized org type ──────────────────────────────────
alter table companies add column if not exists universe_id uuid references company_universe(id) on delete set null;
alter table companies add column if not exists org_type text not null default 'company'
  check (org_type in ('company','staffing','academic','hospital'));
create index if not exists companies_universe_idx on companies(universe_id);

-- 'universe' = inserted from the curated list (seed migration or resolver).
alter table companies drop constraint if exists companies_source_check;
alter table companies add constraint companies_source_check
  check (source in ('seed','llm_resolved','universe'));
