-- product_events: the first-party product-analytics event log. GA4 (see
-- src/app/layout.tsx) gives pageviews but nothing queryable server-side; this
-- table is what the "cofounder-analytics" agent reads to understand signups,
-- journeys, and funnels — and what we co-write alongside GA custom events so we
-- own the data. The typed event registry lives in src/lib/analytics/events.ts.
--
-- Why a NEW table and not `interactions`: interactions has user_id NOT NULL and
-- a hard CHECK on interaction_type (drafted/sent/replied/…), so it cannot hold
-- signup/onboarding/blur-gate or signed-out (anon) events. This table is
-- deliberately schema-light: an event name plus a free-form jsonb `props`.
--
-- user_id is nullable so signed-out (blur-gate) activity is captured too;
-- anon_id (a client-generated, non-PII id) stitches a pre-signup session to the
-- account once the visitor signs in.

create table if not exists product_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,                                  -- null for signed-out events
  anon_id    text,                                  -- client id, stitches pre-signup sessions
  event      text not null,                         -- name from src/lib/analytics/events.ts
  props      jsonb not null default '{}'::jsonb,
  path       text,                                  -- page the event fired on
  session_id text,
  created_at timestamptz not null default now()
);

-- Analyst queries are "events of type X over time" and "this user's journey".
create index if not exists product_events_event_created_idx
  on product_events(event, created_at desc);
create index if not exists product_events_user_created_idx
  on product_events(user_id, created_at desc);
create index if not exists product_events_anon_created_idx
  on product_events(anon_id, created_at desc);

-- Service-role only, mirroring 0013_anon_run_events.sql: enabling RLS with no
-- policy locks the anon key out entirely. Writes go through the ingest route
-- and reads through the admin analytics route, both server-side via
-- supabaseAdmin() (service role, BYPASSRLS). Raw event data is never exposed to
-- the browser's anon key.
alter table public.product_events enable row level security;
