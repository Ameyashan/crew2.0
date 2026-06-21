-- Daily Job-Discovery Feed (Module 0: contracts & schema).
--
-- Four tables that power a proactive, interest-driven job feed:
--   companies        GLOBAL   catalog of ATS boards we scan (company -> ats + slug),
--                             interest-tagged and self-growing (seed + llm_resolved).
--   jobs             GLOBAL   normalized listings pulled from those boards, deduped
--                             on (ats, external_job_id), with deferred enrichment cols.
--   job_preferences  PER-USER the interests + filters that decide what we scan/show.
--   job_matches      PER-USER AI fit score per (user, job) + lifecycle status.
--
-- RLS model is deliberately split:
--   * job_preferences / job_matches are user-owned -> standard owner-only policy
--     (mirrors 0007_rls_policies.sql / 0009_compose_runs.sql).
--   * companies / jobs are GLOBAL reference data. We enable RLS with NO policy so the
--     anon/session key is locked out entirely; all reads are served through API routes
--     using the service-role admin client (src/lib/supabase.ts), which has BYPASSRLS.
--     This mirrors 0007_enable_rls.sql for shared, non-user data.

-- ── companies ────────────────────────────────────────────────────────────────
create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  normalized  text not null,                                          -- lowercased join key (enrichment / profile pins)
  ats         text not null check (ats in ('greenhouse','lever','ashby')),
  slug        text not null,                                          -- board/site slug used by the ATS API
  sectors     text[] not null default '{}',                          -- interest tags; see src/lib/jobs/catalog/sectors.ts
  size_bucket text check (size_bucket in ('large','medium','startup')),  -- optional curated hint
  source      text not null default 'seed' check (source in ('seed','llm_resolved')),
  added_by    uuid,                                                   -- user whose interest grew this row; null for seed
  verified_at timestamptz,                                            -- last time the slug returned >= 1 job
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (ats, slug)
);

create index if not exists companies_normalized_idx on companies(normalized);
create index if not exists companies_sectors_idx on companies using gin (sectors);

-- ── jobs ─────────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id) on delete cascade,
  ats                text not null check (ats in ('greenhouse','lever','ashby')),
  external_job_id    text not null,
  title              text not null,
  company            text not null,                                   -- denormalized display name
  location_raw       text,                                            -- messy free-text, kept verbatim
  city               text,
  region             text,
  country            text,
  remote_type        text not null default 'unknown'
                       check (remote_type in ('remote','hybrid','onsite','unknown')),
  compensation       text,                                            -- nullable; Ashby native, else null
  posted_date        timestamptz,                                     -- Lever createdAt / Ashby publishedDate; GH updated_at (approx)
  posted_date_approx boolean not null default false,                  -- true for Greenhouse (updated_at only)
  url                text not null,
  source             text not null,                                   -- = ats
  raw_json           jsonb not null default '{}'::jsonb,
  -- enrichment (nullable, filled by the deferred pass)
  visa_confidence    text check (visa_confidence in ('likely_sponsors','unclear')),
  company_size       text check (company_size in ('large','medium','startup')),
  enriched_at        timestamptz,
  -- dedup / delta tracking
  first_seen_at      timestamptz not null default now(),              -- set once on insert; never updated on conflict
  last_seen_at       timestamptz not null default now(),
  is_active          boolean not null default true,                   -- flipped false when a scan no longer sees it
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (ats, external_job_id)
);

create index if not exists jobs_company_idx on jobs(company_id);
create index if not exists jobs_posted_idx on jobs(posted_date desc);
create index if not exists jobs_active_idx on jobs(is_active);
create index if not exists jobs_first_seen_idx on jobs(first_seen_at desc);

-- ── job_preferences ──────────────────────────────────────────────────────────
create table if not exists job_preferences (
  user_id       uuid primary key,
  interests     text[] not null default '{}',                        -- chosen sector tags; drives which companies are scanned
  posted_within text not null default 'any' check (posted_within in ('24h','1wk','1mo','any')),
  company_sizes text[] not null default '{}',                        -- subset of {large,medium,startup}; empty = any
  locations     text[] not null default '{}',                        -- e.g. {nyc,sf,boston,seattle,anywhere}; empty = any
  visa_required boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── job_matches ──────────────────────────────────────────────────────────────
create table if not exists job_matches (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null,
  job_id    uuid not null references jobs(id) on delete cascade,
  score     integer not null,                                        -- 0..100 AI fit
  reasons   text,                                                    -- one-line "why this matches"
  status    text not null default 'new'
              check (status in ('new','seen','dismissed','outreach_started')),
  scored_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists job_matches_user_score_idx on job_matches(user_id, score desc);
create index if not exists job_matches_user_status_idx on job_matches(user_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Per-user tables: owner-only, mirroring 0007_rls_policies.sql / 0009_compose_runs.sql.
alter table public.job_preferences enable row level security;
drop policy if exists job_preferences_owner on public.job_preferences;
create policy job_preferences_owner on public.job_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.job_matches enable row level security;
drop policy if exists job_matches_owner on public.job_matches;
create policy job_matches_owner on public.job_matches
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Global reference data: enable RLS with NO policy -> anon/session key locked out.
-- All access is server-side via the service-role admin client (BYPASSRLS), the same
-- pattern 0007_enable_rls.sql used for shared tables before per-user policies existed.
alter table public.companies enable row level security;
alter table public.jobs      enable row level security;

-- ── starter catalog seed ─────────────────────────────────────────────────────
-- Best-effort, high-confidence company -> (ats, slug) mappings so the feed has
-- something on day one. Greenhouse-heavy because its slug is reliably the
-- lowercased company name. Slugs are validated at runtime: the fetch layer
-- (Module 1) isolates per-company errors and the self-growing catalog (Module 2)
-- probes the live board before trusting a slug, so a wrong guess here just yields
-- zero jobs rather than bad data. `on conflict do nothing` keeps re-runs safe.
insert into companies (name, normalized, ats, slug, sectors, size_bucket, source) values
  ('Anthropic',   'anthropic',   'greenhouse', 'anthropic',   array['ai_ml'],                          'medium',  'seed'),
  ('Databricks',  'databricks',  'greenhouse', 'databricks',  array['ai_ml','data_infra'],             'large',   'seed'),
  ('Scale AI',    'scale ai',    'greenhouse', 'scaleai',     array['ai_ml'],                          'medium',  'seed'),
  ('Stripe',      'stripe',      'greenhouse', 'stripe',      array['fintech'],                        'large',   'seed'),
  ('Brex',        'brex',        'greenhouse', 'brex',        array['fintech'],                        'medium',  'seed'),
  ('Plaid',       'plaid',       'greenhouse', 'plaid',       array['fintech'],                        'medium',  'seed'),
  ('Affirm',      'affirm',      'greenhouse', 'affirm',      array['fintech'],                        'large',   'seed'),
  ('Robinhood',   'robinhood',   'greenhouse', 'robinhood',   array['fintech'],                        'large',   'seed'),
  ('Coinbase',    'coinbase',    'greenhouse', 'coinbase',    array['crypto','fintech'],               'large',   'seed'),
  ('Figma',       'figma',       'greenhouse', 'figma',       array['devtools','enterprise_saas'],     'medium',  'seed'),
  ('GitLab',      'gitlab',      'greenhouse', 'gitlab',      array['devtools'],                       'large',   'seed'),
  ('Cloudflare',  'cloudflare',  'greenhouse', 'cloudflare',  array['devtools','security','data_infra'],'large',  'seed'),
  ('Datadog',     'datadog',     'greenhouse', 'datadog',     array['devtools','data_infra'],          'large',   'seed'),
  ('MongoDB',     'mongodb',     'greenhouse', 'mongodb',     array['devtools','data_infra'],          'large',   'seed'),
  ('Twilio',      'twilio',      'greenhouse', 'twilio',      array['devtools','enterprise_saas'],     'large',   'seed'),
  ('HashiCorp',   'hashicorp',   'greenhouse', 'hashicorp',   array['devtools','data_infra'],          'large',   'seed'),
  ('Samsara',     'samsara',     'greenhouse', 'samsara',     array['enterprise_saas'],                'large',   'seed'),
  ('Dropbox',     'dropbox',     'greenhouse', 'dropbox',     array['enterprise_saas'],                'large',   'seed'),
  ('Airbnb',      'airbnb',      'greenhouse', 'airbnb',      array['consumer'],                       'large',   'seed'),
  ('DoorDash',    'doordash',    'greenhouse', 'doordash',    array['consumer'],                       'large',   'seed'),
  ('Instacart',   'instacart',   'greenhouse', 'instacart',   array['consumer'],                       'large',   'seed'),
  ('Pinterest',   'pinterest',   'greenhouse', 'pinterest',   array['consumer'],                       'large',   'seed'),
  ('Reddit',      'reddit',      'greenhouse', 'reddit',      array['consumer'],                       'large',   'seed'),
  ('Discord',     'discord',     'greenhouse', 'discord',     array['consumer','gaming'],              'medium',  'seed'),
  ('OpenAI',      'openai',      'ashby',      'openai',      array['ai_ml'],                          'medium',  'seed'),
  ('Ramp',        'ramp',        'ashby',      'Ramp',        array['fintech'],                        'medium',  'seed'),
  ('Linear',      'linear',      'ashby',      'Linear',      array['devtools'],                       'startup', 'seed'),
  ('Vanta',       'vanta',       'ashby',      'Vanta',       array['security','enterprise_saas'],     'medium',  'seed'),
  ('PostHog',     'posthog',     'ashby',      'PostHog',     array['devtools','data_infra'],          'startup', 'seed'),
  ('Replit',      'replit',      'ashby',      'replit',      array['devtools','ai_ml'],               'startup', 'seed')
on conflict (ats, slug) do nothing;
