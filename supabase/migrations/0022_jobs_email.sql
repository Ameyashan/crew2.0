-- Daily jobs email (digest of new matches, sent after the daily jobs-scan).
--
-- Two pieces:
--   * job_preferences.daily_email — per-user opt-out for the digest. Defaults
--     ON: the email is the product's daily pull, and the preferences page
--     carries the toggle.
--   * jobs_email_log — one row per email actually sent. Its latest sent_at is
--     the "new since" cutoff for the next digest, which makes the cron
--     idempotent (a re-run the same day finds nothing newer than the log row)
--     and self-healing (a missed day just widens the next email's window).
--     No row is written when a user has nothing new, so quiet days roll over.
--
-- RLS mirrors job_matches / job_preferences (0010_jobs_feed.sql): owner-only
-- for the authenticated role; all app access is server-side via the
-- service-role admin client (BYPASSRLS).

alter table job_preferences add column if not exists daily_email boolean not null default true;

create table if not exists jobs_email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  sent_at     timestamptz not null default now(),
  match_count int not null,
  job_ids     jsonb not null default '[]'::jsonb
);

-- "last email for this user" is the hot query.
create index if not exists jobs_email_log_user_idx on jobs_email_log(user_id, sent_at desc);

alter table public.jobs_email_log enable row level security;
drop policy if exists jobs_email_log_owner on public.jobs_email_log;
create policy jobs_email_log_owner on public.jobs_email_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
