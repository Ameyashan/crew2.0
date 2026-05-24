-- Row Level Security: database-level backstop for the app-layer user scoping.
--
-- Every user-owned table gets RLS enabled plus an "owner" policy that limits
-- the `authenticated` role to rows where auth.uid() = user_id. The `anon` role
-- gets no policy, so an anonymous/public key cannot read or write any row.
--
-- The server uses the Supabase SERVICE ROLE key (see src/lib/supabase.ts),
-- whose Postgres role has BYPASSRLS — so all trusted server-side queries
-- (agent pipeline writes, cron, the inbound webhook) keep working unchanged.
-- These policies actively enforce isolation for any path that uses the anon
-- key with a user session (e.g. client-side queries, or a leaked anon key).
--
-- IMPORTANT: with RLS enabled, the admin client MUST be initialised with the
-- service role key. The anon-key fallback that previously existed would be
-- blocked by these policies (auth.uid() is null without a session).

do $$
declare
  t text;
begin
  foreach t in array array[
    'people',
    'drafts',
    'interactions',
    'followups',
    'voice_samples',
    'agent_runs',
    'daily_digests',
    'resume_generations',
    'job_applications',
    'replies',
    'user_profile'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_owner', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t || '_owner', t
      );
    end if;
  end loop;
end $$;
