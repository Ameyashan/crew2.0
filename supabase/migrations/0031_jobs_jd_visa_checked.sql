-- JD visa parse becomes on-demand. The jobs-fetch drain used to LLM-read every
-- new job's description for sponsorship language; after the company-universe
-- scale-up (~100k new jobs in a day) that was ~27k model calls for jobs no user
-- ever sees. The drain now does only the free enrichment (company size, USCIS
-- track record) and the LLM read runs for scoring candidates. This column marks
-- which jobs have had that read, independent of enriched_at.
alter table jobs add column if not exists jd_visa_checked_at timestamptz;

-- Every job enriched so far went through the LLM read (keyword-screened).
update jobs set jd_visa_checked_at = enriched_at
  where enriched_at is not null and jd_visa_checked_at is null;
