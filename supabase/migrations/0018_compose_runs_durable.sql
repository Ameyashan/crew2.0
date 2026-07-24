-- Durable, connection-decoupled compose runs.
--
-- Before this, a job/apply run executed *inside* the SSE ReadableStream of
-- /api/compose/apply. The serverless function stayed alive only while that
-- stream was open, so backgrounding the app on mobile (which tears the
-- connection down) stranded the run at outcome='in_flight' forever. Now the
-- POST persists everything needed to run the job, schedules the pipeline via
-- next/server `after()` (which outlives the request), and a cron worker is the
-- backstop for anything that dies past maxDuration or across a redeploy. The
-- client only observes the row.
--
-- This adds the columns that make the row self-sufficient:
--   payload      — the run's inputs, so a fresh worker invocation can execute
--                  the whole job with no client involvement.
--   steps        — incremental progress events the executor appends, so any
--                  device polling the row can render live progress.
--   heartbeat_at — refreshed on every step; the lease/liveness signal the
--                  worker and the stale-sweep use to tell a live run from a
--                  dead one.
--   locked_at    — cooperative lease so at most one executor (the after()
--                  continuation or a worker tick) drives a given run.
--   anon_id      — opaque per-visitor token (httpOnly cookie) so signed-out
--                  runs persist and survive a background/reload too. user_id
--                  becomes nullable to allow these anon-owned rows.

alter table compose_runs add column if not exists payload      jsonb;
alter table compose_runs add column if not exists steps        jsonb not null default '[]'::jsonb;
alter table compose_runs add column if not exists heartbeat_at  timestamptz;
alter table compose_runs add column if not exists locked_at     timestamptz;
alter table compose_runs add column if not exists anon_id       text;

-- Anonymous (blur-gate teaser) runs are owned by an anon_id cookie, not an
-- account, so user_id must be nullable. Every persistence path already gates on
-- maybeUserId()/isAnonymousRun(), and reads of anon rows are gated on the
-- anon_id cookie in the history endpoints (RLS is authenticated-owner-only, so
-- anon rows sit outside RLS and are only ever reached via the service role).
alter table compose_runs alter column user_id drop not null;

-- The worker sweeps for in_flight rows ordered by liveness; index the pair it
-- filters on.
create index if not exists compose_runs_inflight_idx
  on compose_runs (outcome, heartbeat_at);

-- Look up an anon visitor's own runs by their cookie token.
create index if not exists compose_runs_anon_idx
  on compose_runs (anon_id)
  where anon_id is not null;
