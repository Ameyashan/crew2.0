-- Company-universe preferences (steps 3 + 4 of the universe plan).
--   include_universe  also scan the curated employer list (Fortune 500, top
--                     startups, top H-1B sponsors) for roles matching the
--                     user's target titles, beyond their chosen sectors.
--                     Default ON — it's the point of the list.
--   include_staffing  let IT outsourcing / staffing firms (company_universe
--                     org_type 'staffing') into candidates and the feed.
--                     Default OFF: they file H-1Bs at volume and post mostly
--                     client-placed contract roles, so they'd flood a visa
--                     seeker's feed. Pins / follows still bypass it.
alter table job_preferences add column if not exists include_universe boolean not null default true;
alter table job_preferences add column if not exists include_staffing boolean not null default false;
