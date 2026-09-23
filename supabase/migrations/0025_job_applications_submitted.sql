-- The extension confirms a real submission and advances status.
-- status values: drafted | sent | replied | archived | submitted (text, no
-- constraint — see 0005_job_applications.sql).
alter table job_applications
  add column if not exists submitted_at timestamptz;
