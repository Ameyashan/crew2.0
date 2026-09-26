-- "Who to reach out to" results per user + job (src/lib/jobs/contacts.ts).
-- Finding them spends a Claude web search, a notes call and a few Apollo
-- credits, so the result is cached here; the job page reads the cache and only
-- recomputes on an explicit refresh (at most hourly). Rows also count toward
-- a per-user daily cap on fresh lookups.
create table if not exists job_contacts (
  user_id    uuid not null,
  job_id     uuid not null references jobs(id) on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists job_contacts_user_created_idx on job_contacts(user_id, created_at desc);

alter table public.job_contacts enable row level security;
drop policy if exists job_contacts_owner on public.job_contacts;
create policy job_contacts_owner on public.job_contacts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
