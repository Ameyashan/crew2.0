-- Story (Phase E of the jugaadu reskin): the living record behind every resume.
--
-- Each entry is a raw, first-person note the user logs ("shipped the billing
-- migration, cut p95 by 40%"). The résumé agent polishes a raw note into a
-- proposed resume-ready `bullet`; the user approves it (→ polished) or keeps it
-- raw. Entries carry free-text `tags` that drive the Story page's "By theme"
-- grouping and give the resume-run pull panel material to weave from.
--
-- Per-user, owner-only RLS — mirrors 0009_compose_runs.sql / 0010_jobs_feed.sql.

create table if not exists story_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  raw        text not null,                                            -- the user's words, verbatim
  bullet     text,                                                     -- polished resume line (null until proposed)
  status     text not null default 'raw'
               check (status in ('pending','proposed','polished','raw')),
  tags       text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_entries_user_idx on story_entries(user_id, created_at desc);
create index if not exists story_entries_tags_idx on story_entries using gin (tags);

alter table public.story_entries enable row level security;
drop policy if exists story_entries_owner on public.story_entries;
create policy story_entries_owner on public.story_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
