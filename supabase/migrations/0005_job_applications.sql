-- One row per Compose "job" run. Ties together the tailored resume, the
-- hiring-manager person, and the outreach draft Crew produced — so the
-- /app/compose done view can present the whole bundle and Today can show
-- pending applications without a join walk.

create table if not exists job_applications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null,
  job_url               text,
  job_json              jsonb,           -- parsed job posting + meta
  resume_generation_id  uuid references resume_generations(id) on delete set null,
  person_id             uuid,            -- soft FK to people(id); kept loose for now
  draft_id              uuid,            -- soft FK to drafts(id)
  status                text not null default 'drafted',
                        -- drafted | sent | replied | archived
  created_at            timestamptz not null default now()
);

create index if not exists job_applications_user_idx
  on job_applications(user_id);
create index if not exists job_applications_created_idx
  on job_applications(created_at desc);
