-- Goal chat (src/lib/goal/*). A user talks with the goal coach, which proposes
-- a structured job-search goal; once the user locks it, it's the source of
-- truth for ranking and the Desk, and is projected into job_preferences and
-- user_profile.goal_brief so existing readers pick it up.

-- One conversation with the coach. At most one open chat per user; "Start
-- over" archives it. context_snapshot is the profile context frozen when the
-- chat opened, so the prompt prefix stays byte-stable (prompt caching) for the
-- life of the chat.
create table if not exists goal_chats (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  status           text not null default 'open' check (status in ('open', 'archived')),
  source           text not null default 'app' check (source in ('onboarding', 'app')),
  context_snapshot text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists goal_chats_one_open on goal_chats(user_id) where status = 'open';

-- The transcript: exact Anthropic content blocks per turn, append-only. seq is
-- unique per chat so two tabs racing on the same turn get a conflict instead
-- of interleaving history.
create table if not exists goal_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references goal_chats(id) on delete cascade,
  user_id    uuid not null,
  seq        int  not null,
  role       text not null check (role in ('user', 'assistant')),
  content    jsonb not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (chat_id, seq)
);

create index if not exists goal_chat_messages_user_created_idx on goal_chat_messages(user_id, created_at desc);

-- The locked goal. spec is a validated GoalSpec (src/lib/goal/goal-logic.ts).
-- Refining archives the old row and inserts a new one; started_at carries over
-- so progress is measured from when the user first set out.
create table if not exists career_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  status       text not null default 'active' check (status in ('active', 'archived')),
  spec         jsonb not null,
  summary      text not null,
  short_label  text,
  chat_id      uuid references goal_chats(id) on delete set null,
  started_at   timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  archived_at  timestamptz
);

create unique index if not exists career_goals_one_active on career_goals(user_id) where status = 'active';
create index if not exists career_goals_user_idx on career_goals(user_id, finalized_at desc);

-- Outreach-safe goal text (no comp floor, no dealbreakers) appended to the
-- sender context that drafts, answers and contact notes already read.
alter table user_profile add column if not exists goal_brief text;

alter table public.goal_chats enable row level security;
drop policy if exists goal_chats_owner on public.goal_chats;
create policy goal_chats_owner on public.goal_chats
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.goal_chat_messages enable row level security;
drop policy if exists goal_chat_messages_owner on public.goal_chat_messages;
create policy goal_chat_messages_owner on public.goal_chat_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.career_goals enable row level security;
drop policy if exists career_goals_owner on public.career_goals;
create policy career_goals_owner on public.career_goals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
