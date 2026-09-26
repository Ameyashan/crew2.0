-- Log every LLM run, including the ones with no user. Cron work (runAsSystem)
-- and anonymous blur-gate runs used to skip agent_runs because it required a
-- user_id — so the company-universe spike (~27k cron visa-parse calls, ~$110
-- in a day) never showed up in the cost telemetry. System rows carry
-- user_id null + system = true; anonymous rows user_id null + system = false.
-- The owner RLS policy (auth.uid() = user_id) never matches a null user_id,
-- so these rows stay service-role only.
alter table agent_runs alter column user_id drop not null;
alter table agent_runs add column if not exists system boolean not null default false;
create index if not exists agent_runs_system_created_idx on agent_runs(created_at) where system;

-- Today's system spend for the daily cap (src/lib/llm-budget.ts). A function
-- so the sum happens in Postgres, not over a row-capped PostgREST select.
create or replace function system_llm_spend_since(since timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0) from agent_runs where system and created_at >= since
$$;
revoke all on function system_llm_spend_since(timestamptz) from public, anon, authenticated;
grant execute on function system_llm_spend_since(timestamptz) to service_role;
