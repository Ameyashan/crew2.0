-- compose_runs: one row per reach-out / job-apply compose session, persisted so
-- a run kicked off on one device is visible (and resumable) on another. The
-- low-level data already lives in people / drafts / screenshots / agent_runs;
-- this table is the high-level "session" that ties them together, mirroring
-- the resume_generations pattern.

create table if not exists compose_runs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null,
  kind                 text not null check (kind in ('person','job')),
  input                text not null,                                -- typed query/URL, or screenshot filename
  intent               text,
  provided_email       text,
  screenshot_id        uuid references screenshots(id) on delete set null,
  picked               jsonb,                                        -- disambiguation pick if any
  person_id            uuid references people(id) on delete set null,
  output               jsonb not null default '{}'::jsonb,           -- {parsed, person, enrichment, candidates}
  resume_generation_id uuid references resume_generations(id) on delete set null,
  outcome              text not null check (outcome in ('complete','error','needs_disambiguation','in_flight')),
  error                text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index if not exists compose_runs_user_idx on compose_runs(user_id);
create index if not exists compose_runs_created_idx on compose_runs(created_at desc);

-- RLS: owner-only, mirroring 0007_rls_policies.sql + 0008_screenshots.sql.
alter table public.compose_runs enable row level security;
drop policy if exists compose_runs_owner on public.compose_runs;
create policy compose_runs_owner on public.compose_runs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tie each generated draft back to the run that produced it, so the history
-- detail endpoint can fetch a run's drafts in one query.
alter table drafts add column if not exists compose_run_id uuid
  references compose_runs(id) on delete set null;
create index if not exists drafts_compose_run_idx on drafts(compose_run_id);
