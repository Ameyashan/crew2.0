-- LinkedIn connections, imported from the user's own Connections.csv export
-- (Settings → Data privacy → Get a copy of your data). Powers "people you
-- know at <company>" on the tracker and job pages, and the warm-intro draft.
--
-- Privacy: third-party contact data, so we keep the minimum — name, profile
-- URL, company, title, connected-on. Email addresses are dropped in the
-- browser before upload (src/lib/connections/csv.ts) and never stored.
-- An import replaces the user's whole set; the user can delete it any time.
-- Big exports arrive in chunks (request-size limits): chunk rows land with
-- pending = true and only replace the previous set when the last chunk
-- commits, so readers (which skip pending rows) never see a half import.
--
-- company_key / company_core are precomputed match keys
-- (src/lib/connections/match.ts) so "Goldman Sachs" finds "Goldman Sachs
-- Group" with an indexed equality lookup.
create table if not exists connections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  full_name    text not null,
  linkedin_url text,
  company      text,
  position     text,
  connected_on date,
  company_key  text,
  company_core text,
  pending      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists connections_user_core_idx on connections(user_id, company_core);

-- Owner-only for the authenticated role; the app reads/writes server-side via
-- the service-role client (BYPASSRLS), like every other per-user table.
alter table public.connections enable row level security;
drop policy if exists connections_owner on public.connections;
create policy connections_owner on public.connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
