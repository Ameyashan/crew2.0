-- Story entries — the living record behind every resume (Phase E of the jugaadu
-- reskin). Each entry is something the user did, captured raw in their own words;
-- the resume agent polishes each `raw` line into a resume-ready `bullet` the user
-- approves. The Story page (/app/resume) and the run view's pull-review panel
-- read from this table; onboarding / resume upload seed it from `resume_text`.
--
-- Lifecycle (`status`):
--   raw       just captured; no polished bullet yet (or the user chose to keep it raw)
--   pending   handed to the resume agent; "…is polishing this" in the UI
--   proposed  agent produced a `bullet`; awaiting the user's Approve / Keep it raw
--   polished  the user approved the bullet — the resume-ready version
--
-- RLS: owner-only, mirroring 0007_rls_policies.sql / 0009_compose_runs.sql. All
-- server access goes through the service-role admin client (BYPASSRLS).

create table if not exists story_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  raw        text not null,                                            -- the entry in the user's own words
  bullet     text,                                                     -- resume-ready line (null until polished/proposed)
  status     text not null default 'raw'
               check (status in ('pending','proposed','polished','raw')),
  tags       text[] not null default '{}',                            -- theme tags; drive the "By theme" grouping
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_entries_user_idx on story_entries(user_id, created_at desc);
create index if not exists story_entries_tags_idx on story_entries using gin (tags);

-- RLS: owner-only, mirroring the per-user tables in 0007_rls_policies.sql.
alter table public.story_entries enable row level security;
drop policy if exists story_entries_owner on public.story_entries;
create policy story_entries_owner on public.story_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
