-- Durable, connection-decoupled résumé generations.
--
-- Mirrors 0018_compose_runs_durable.sql onto resume_generations so the
-- standalone résumé-tailor path (/api/resume/tailor) can run in a background
-- continuation (next/server `after()`) with the cron-worker backstop, instead
-- of executing inside the SSE stream and dying when the client backgrounds.
--
--   payload      — the tailor's inputs (job_url / highlights / page_count) so a
--                  fresh worker invocation can re-run with no client.
--   steps        — incremental progress events the executor appends, for the
--                  client polling /api/resume/history/[id] to render live.
--   heartbeat_at — refreshed on every step; the lease/liveness signal the worker
--                  and the stale-sweep use.
--   locked_at    — cooperative lease so at most one executor drives a run.
--
-- The embedded résumé inside a job compose run keeps using
-- runResumeTailorStreamPersisted (which self-inserts its own row); these columns
-- just stay null there.

alter table resume_generations add column if not exists payload      jsonb;
alter table resume_generations add column if not exists steps        jsonb not null default '[]'::jsonb;
alter table resume_generations add column if not exists heartbeat_at  timestamptz;
alter table resume_generations add column if not exists locked_at     timestamptz;

-- The worker sweeps for in_flight generations ordered by liveness.
create index if not exists resume_generations_inflight_idx
  on resume_generations (status, heartbeat_at);
