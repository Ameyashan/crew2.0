-- Application details the extension autofills into ATS forms. Kept on
-- user_profile (user-entered, verified) rather than TailoredResume.header
-- (model-generated) so autofill never invents contact info.
alter table user_profile
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists location text,
  add column if not exists work_authorization text,
  add column if not exists needs_sponsorship boolean,
  add column if not exists github_url text,
  add column if not exists portfolio_url text;

comment on column user_profile.email is 'Application email; may differ from auth email';
comment on column user_profile.location is 'Freeform "City, ST, Country" — matches ATS location typeaheads best as one string';
comment on column user_profile.work_authorization is 'Freeform context, e.g. us_citizen / green_card / h1b / f1_opt';
comment on column user_profile.needs_sponsorship is 'The yes/no most Greenhouse/Ashby forms actually ask';
