-- anon_run_events: one row per crew run started by a signed-out visitor (the
-- blur-gate teaser). Signed-out runs execute for real but persist nothing to
-- the user-owned tables; this is the ONLY thing they write. It exists solely to
-- rate-limit anonymous compute: we count recent rows per hashed IP before
-- letting another anonymous run through (see src/lib/anon-rate-limit.ts).
--
-- ip_hash is a sha256 of the client IP — we never store the raw address.

create table if not exists anon_run_events (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

-- The rate-limit query is "count rows for this ip_hash since <cutoff>".
create index if not exists anon_run_events_ip_created_idx
  on anon_run_events(ip_hash, created_at desc);

-- Service-role only, mirroring 0007_enable_rls.sql: enabling RLS with no
-- policies locks the anon key out; supabaseAdmin (service role) bypasses it.
alter table public.anon_run_events enable row level security;
