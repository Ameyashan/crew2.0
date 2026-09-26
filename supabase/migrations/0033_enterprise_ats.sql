-- Enterprise job boards: Oracle Recruiting Cloud, SmartRecruiters, Eightfold
-- and iCIMS (adapters in src/lib/jobs/sources/, ported from career-ops). Many
-- Fortune 500 employers the resolver couldn't place live on these — Goldman
-- Sachs and JPMorgan Chase on Oracle, for example.
--
-- Slug formats (see src/lib/jobs/sources/formats.ts):
--   oracle          "<host>/<siteNumber>"   jpmc.fa.oraclecloud.com/CX_1001
--   smartrecruiters "<company id>"          servicenow
--   eightfold       "<tenant>/<domain>"     micron/micron.com
--   icims           "<portal host>"         careers-quest.icims.com
alter table companies drop constraint if exists companies_ats_check;
alter table companies add constraint companies_ats_check
  check (ats in ('greenhouse','lever','ashby','workday','oracle','smartrecruiters','eightfold','icims'));

alter table jobs drop constraint if exists jobs_ats_check;
alter table jobs add constraint jobs_ats_check
  check (ats in ('greenhouse','lever','ashby','workday','oracle','smartrecruiters','eightfold','icims'));

-- Boards verified by hand against the live APIs (ownership: each board's own
-- postings name the employer). Linked to their universe rows so the tracker
-- search can offer them right away.
with verified(match_name, ats, slug) as (
  values
    ('Goldman Sachs Group', 'oracle', 'hdpc.fa.us2.oraclecloud.com/LateralHiring'),
    ('JPMorgan Chase',      'oracle', 'jpmc.fa.oraclecloud.com/CX_1001')
),
targets as (
  select u.*, v.ats as board_ats, v.slug as board_slug
  from verified v
  join company_universe u on u.name = v.match_name
),
ins as (
  insert into companies (name, normalized, ats, slug, sectors, size_bucket, source, verified_at, universe_id, org_type)
  select t.name, lower(trim(t.name)), t.board_ats, t.board_slug, t.sectors, t.size_bucket, 'universe', now(), t.id, t.org_type
  from targets t
  on conflict do nothing
  returning universe_id, ats, slug
)
update company_universe u
set resolve_status = 'resolved',
    resolved_at = now(),
    resolve_note = ins.ats || ':' || ins.slug || ' (seeded 0033)',
    next_resolve_at = null,
    updated_at = now()
from ins
where u.id = ins.universe_id;

-- Everyone still unplaced deserves another look now that the resolver can
-- guess and verify these four ATSes. Rather than resetting their backoff here
-- (the code already deployed would spend those retries on the old ATS list),
-- rows carry the resolver version that last tried them: the new resolver
-- (RESOLVER_VERSION = 2 in universe/resolve.ts) treats any unresolved row
-- tried by an older version as due, with a fresh attempt budget.
alter table company_universe add column if not exists resolver_version integer not null default 1;
