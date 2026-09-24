-- Per-board fetch state (step 5 of the universe plan: scale). With ~1k boards
-- the catalog no longer fits in one daily request; the jobs-fetch cron drains
-- it in stale-first, time-budgeted slices and needs to know what's stale.
alter table companies add column if not exists last_fetched_at timestamptz;
alter table companies add column if not exists fetch_error text;
alter table companies add column if not exists fetch_failures integer not null default 0;
create index if not exists companies_fetch_queue_idx on companies(active, last_fetched_at nulls first);

-- Per-user scoring cursor. Scoring runs one LLM pass per user; as users grow
-- that no longer fits one request either, so users are scored oldest-first
-- within a deadline and the rest carry over to later jobs-fetch ticks.
create table if not exists job_scan_state (
  user_id         uuid primary key,
  last_scanned_at timestamptz not null default now(),   -- last SUCCESSFUL scoring pass
  claimed_at      timestamptz                           -- lease held by a run scoring this user now
);
-- Service-role only (written by crons), like the other scan internals.
alter table public.job_scan_state enable row level security;
