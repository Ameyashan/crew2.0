-- Parsed pay for a job (src/lib/jobs/comp.ts). Only Ashby exposes pay as a
-- field (jobs.compensation); everywhere else it's in the JD text. Parsed
-- lazily when a job is scored for a user (src/lib/jobs/score.ts), so a goal's
-- pay floor can be checked in the feed. comp_parsed_at is set even when no pay
-- was found, so a job is only parsed once.
--   comp_min_usd / comp_max_usd  annualized USD (null for other currencies)
--   comp_currency                USD | CAD | EUR | GBP
--   comp_period                  year | month | hour (as posted)
--   comp_label                   display string, e.g. "$106k–$145k"
alter table jobs add column if not exists comp_min_usd   integer;
alter table jobs add column if not exists comp_max_usd   integer;
alter table jobs add column if not exists comp_currency  text;
alter table jobs add column if not exists comp_period    text;
alter table jobs add column if not exists comp_label     text;
alter table jobs add column if not exists comp_parsed_at timestamptz;
