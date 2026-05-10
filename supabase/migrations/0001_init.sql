-- Crew v1 schema. Multi-tenant from day one (single user in practice).
-- Hand-applied: paste into Supabase SQL editor, or use `supabase db push`.

create extension if not exists "pgcrypto";

-- people: anyone we've researched, drafted to, or sent to.
create table if not exists people (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  name            text not null,
  role            text,
  company         text,
  email           text,
  email_confidence numeric,
  email_source    text,
  links           jsonb not null default '{}'::jsonb,           -- {linkedin, x, website, ...}
  enrichment      jsonb not null default '{}'::jsonb,           -- raw Apollo / research cache
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists people_user_idx on people(user_id);
create index if not exists people_name_idx on people using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(role,'') || ' ' || coalesce(notes,'')));

-- drafts: every generated message.
create table if not exists drafts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  person_id       uuid references people(id) on delete cascade,
  channel         text not null check (channel in ('email','x_dm','linkedin')),
  subject         text,
  body            text not null,
  intent          text,
  status          text not null default 'generated' check (status in ('generated','edited','sent','discarded')),
  model           text,
  parent_draft_id uuid references drafts(id) on delete set null, -- for followups
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists drafts_user_idx on drafts(user_id);
create index if not exists drafts_person_idx on drafts(person_id);

-- interactions: polymorphic event log; future agents log here too.
create table if not exists interactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  person_id       uuid references people(id) on delete cascade,
  agent_type      text not null default 'reach_out',           -- reach_out | resume | opportunities | ...
  interaction_type text not null check (interaction_type in ('drafted','sent','replied','no_reply','clicked','followed_up')),
  channel         text,
  draft_id        uuid references drafts(id) on delete set null,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists interactions_user_idx on interactions(user_id);
create index if not exists interactions_person_idx on interactions(person_id);
create index if not exists interactions_type_idx on interactions(interaction_type);
create index if not exists interactions_created_idx on interactions(created_at desc);

-- followups: scheduled actions Crew should remind about.
create table if not exists followups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  person_id       uuid references people(id) on delete cascade,
  source_interaction_id uuid references interactions(id) on delete set null,
  draft_id        uuid references drafts(id) on delete set null,
  due_at          timestamptz not null,
  status          text not null default 'pending' check (status in ('pending','sent','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists followups_user_idx on followups(user_id);
create index if not exists followups_due_idx on followups(due_at);
create index if not exists followups_status_idx on followups(status);

-- voice_samples: optional exemplars used as few-shots for draft().
create table if not exists voice_samples (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  channel         text,
  body            text not null,
  source          text,                                         -- 'manual' | 'edit_loop' | etc.
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists voice_user_idx on voice_samples(user_id);

-- agent_runs: every invocation of any agent. Foundation for cost / analytics.
create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  agent_type      text not null,                                -- reach_out:research | reach_out:draft | apollo:find_email | ...
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric,
  latency_ms      integer,
  outcome         text,                                         -- 'ok' | 'error' | 'no_match'
  error           text,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists agent_runs_user_idx on agent_runs(user_id);
create index if not exists agent_runs_agent_idx on agent_runs(agent_type);
create index if not exists agent_runs_created_idx on agent_runs(created_at desc);

-- daily_digests: snapshot per cron run, used to badge the Today page.
create table if not exists daily_digests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  generated_at    timestamptz not null default now(),
  pending_followups integer not null default 0,
  pending_reviews integer not null default 0,
  snapshot        jsonb not null default '{}'::jsonb
);

create index if not exists daily_digests_user_idx on daily_digests(user_id);
create index if not exists daily_digests_generated_idx on daily_digests(generated_at desc);
