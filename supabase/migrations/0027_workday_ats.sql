-- Workday boards (step 2 of the company universe plan). Most Fortune 500
-- employers host careers on Workday; the adapter lives in
-- src/lib/jobs/sources/workday.ts. Catalog slug format: "tenant/wdN/site".
alter table companies drop constraint if exists companies_ats_check;
alter table companies add constraint companies_ats_check
  check (ats in ('greenhouse','lever','ashby','workday'));

alter table jobs drop constraint if exists jobs_ats_check;
alter table jobs add constraint jobs_ats_check
  check (ats in ('greenhouse','lever','ashby','workday'));
