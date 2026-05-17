-- ATS score per tailored resume version. Surfaced as the "Avg. ATS · last 10"
-- header on /app/resume and the per-row ATS chip. Populated by the
-- resume-tailor agent during generation.

alter table resume_generations
  add column if not exists ats_score smallint;

create index if not exists resume_generations_ats_idx
  on resume_generations(ats_score);
