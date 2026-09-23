-- Bearer tokens for the Chrome extension. Plaintext is shown once at mint and
-- never stored; token_hash is sha256 hex of the full token.
create table if not exists extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists extension_tokens_user_idx on extension_tokens(user_id);

-- Service-role only, matching 0007_enable_rls.sql: RLS on, no policies.
alter table public.extension_tokens enable row level security;
