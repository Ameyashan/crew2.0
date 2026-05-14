-- Resume tailoring history. One row per completed /api/resume/tailor run.

create table if not exists resume_generations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  job_url          text,
  highlights       text,
  regenerate_notes text,
  page_count       smallint not null default 1 check (page_count in (1, 2)),
  target_role      text,
  target_company   text,
  model            text,
  resume           jsonb not null,
  created_at       timestamptz not null default now()
);

create index if not exists resume_generations_user_idx
  on resume_generations(user_id);
create index if not exists resume_generations_created_idx
  on resume_generations(created_at desc);
