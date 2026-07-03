-- Lifecycle for resume tailoring runs, mirroring compose_runs: the row is
-- inserted 'in_flight' before streaming starts so interrupted runs are visible
-- in History, and finalized (complete/error) when the stream settles.

alter table resume_generations
  add column if not exists status text not null default 'complete'
    check (status in ('in_flight', 'complete', 'error')),
  add column if not exists error text,
  add column if not exists completed_at timestamptz;

-- The blob is only known at completion now.
alter table resume_generations alter column resume drop not null;

create index if not exists resume_generations_status_idx
  on resume_generations(status);
