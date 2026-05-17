-- Inbound replies to outreach Crew sent. Populated by /api/inbound/reply
-- when an email arrives via the configured mail-provider webhook (Postmark,
-- SendGrid, etc.). The webhook matches by In-Reply-To against drafts.message_id;
-- Crew's reply summariser then writes summary + suggested_reply.

create table if not exists replies (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  draft_id         uuid references drafts(id) on delete set null,
  person_id        uuid references people(id) on delete set null,
  from_email       text not null,
  subject          text,
  body             text not null,
  sentiment        text,     -- 'warm' | 'cool' | 'cold' | null (unsummarised)
  summary          text,
  suggested_reply  text,
  intro_offered    boolean default false,
  meeting          text,
  raw              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists replies_user_idx on replies(user_id);
create index if not exists replies_draft_idx on replies(draft_id);
create index if not exists replies_created_idx on replies(created_at desc);

-- Track outbound message ids on drafts so inbound webhooks can match replies
-- back to the conversation. Set when Crew actually sends the email.
alter table drafts
  add column if not exists message_id text;

create unique index if not exists drafts_message_id_idx
  on drafts(message_id) where message_id is not null;
