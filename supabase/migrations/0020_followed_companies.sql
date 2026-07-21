-- Followed companies (Jobs feed).
--
-- A lightweight, per-user "follow this company" gesture, distinct from the
-- onboarding `target_companies` pins (free-text strings on the profile blob).
-- A follow is a first-class relation to a catalog row, so it FKs `companies(id)`
-- and carries its own `created_at` (used for "new since you followed" and the
-- recency strip).
--
-- Following a company does two things:
--   * feeds candidate selection (src/lib/jobs/scan.ts resolveCompanyIds) so the
--     company keeps getting scanned + scored into the ranked feed even when it
--     falls outside the user's sector interests, and
--   * powers the "New at companies you follow" strip, which reads recent `jobs`
--     rows for the followed company_ids directly.
--
-- RLS mirrors job_matches / job_preferences (0010_jobs_feed.sql): owner-only for
-- the authenticated role; all app access is server-side via the service-role
-- admin client (BYPASSRLS).

create table if not exists followed_companies (
  user_id    uuid not null,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

-- "everything I follow" + "who follows this company" both stay index-served.
create index if not exists followed_companies_user_idx on followed_companies(user_id);
create index if not exists followed_companies_company_idx on followed_companies(company_id);

alter table public.followed_companies enable row level security;
drop policy if exists followed_companies_owner on public.followed_companies;
create policy followed_companies_owner on public.followed_companies
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
