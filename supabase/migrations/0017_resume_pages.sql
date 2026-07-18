-- Resume length preference.
--
-- When Jugaadu tailors a résumé as part of applying to a job, it needs to know
-- how long to make it. This column stores the user's preferred page count
-- (1 or 2). Unset (null) is treated as 1 page by the consumer.
alter table user_profile
  add column if not exists resume_pages integer;

-- Constrain to the two supported page counts. Added separately so re-running the
-- migration doesn't fail on the column already existing.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profile_resume_pages_check'
  ) then
    alter table user_profile
      add constraint user_profile_resume_pages_check
      check (resume_pages is null or resume_pages in (1, 2));
  end if;
end $$;
