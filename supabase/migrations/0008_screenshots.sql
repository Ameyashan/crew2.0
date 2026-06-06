-- Screenshots a user attaches in Compose. The raw image lives in the private
-- "screenshots" storage bucket; this table tracks each upload plus what the
-- vision pass detected (job vs person) so a run can be reconstructed.

create table if not exists screenshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  bucket        text not null default 'screenshots',
  path          text not null,            -- object key within the bucket
  content_type  text,
  byte_size     bigint,
  kind          text,                     -- 'job' | 'person' | null (undetected)
  detected      jsonb,                    -- full identifyFromImage result
  created_at    timestamptz not null default now()
);

create index if not exists screenshots_user_idx on screenshots(user_id);
create index if not exists screenshots_created_idx on screenshots(created_at desc);

-- RLS: owner-only, mirroring 0007_rls_policies.sql. The server uses the service
-- role (BYPASSRLS); this guards any anon-key + session access.
alter table public.screenshots enable row level security;
drop policy if exists screenshots_owner on public.screenshots;
create policy screenshots_owner on public.screenshots
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private bucket for the raw images. Created idempotently.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

-- Storage object policies: a user may read/write only objects under a folder
-- named after their uid (path "<uid>/<file>"). The server's service-role
-- client bypasses these; they exist so a leaked anon key stays scoped.
drop policy if exists "screenshots read own" on storage.objects;
create policy "screenshots read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "screenshots insert own" on storage.objects;
create policy "screenshots insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "screenshots delete own" on storage.objects;
create policy "screenshots delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
