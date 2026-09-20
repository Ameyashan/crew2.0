# H-1B track record: loading USCIS data (operator runbook)

The Jobs feed's `SPONSORS · 214 FILED FY25` chips are powered by the USCIS
H-1B Employer Data Hub — public, per-fiscal-year CSVs of every employer's
H-1B petition outcomes. Nothing lights up until that data is ingested, and
ingestion is a manual step you run from your own machine. This doc is the
how and the why.

## Why your laptop, not a cron

uscis.gov (and dol.gov) sit behind Akamai bot protection that 403s requests
from datacenter IP ranges — cloud agents, CI, and most likely Vercel's
serverless egress too. A residential connection (your laptop's browser or
curl) gets the files fine. Since USCIS only refreshes the files roughly
quarterly, a manual download + one curl is the honest architecture: no
scraper to babysit, no proxy to pay for.

The app side is already automated: `POST /api/admin/h1b-ingest` parses the
CSV, dedupes per fiscal year, re-matches the whole company catalog against
the employer names (exact-normalized first, LLM disambiguation for legal
names like "AMAZON.COM SERVICES LLC"), and pushes evidence onto every active
job. Daily scans then keep new jobs enriched from the stored data — no
further USCIS contact needed until the next quarterly refresh.

## Step 1 — download the files

1. Go to <https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub>
   and open **H-1B Employer Data Hub Files** (the "Files" sub-page).
2. Download the CSV for each fiscal year you want. Recommended: the three
   most recent (e.g. FY2024, FY2025, FY2026-to-date). Files are named like
   `h1b_datahubexport-2025.csv`, a few MB each.
   - The chip's recency gate only trusts filings from the last 2 fiscal
     years (`RECENT_FY_WINDOW` in `src/lib/jobs/h1b/normalize.ts`), so older
     years add history to the detail view but don't change chips.
3. Columns you'll see: Fiscal Year, Employer, Initial Approval/Denial
   (first-time petitions — the lottery-bound kind OPT candidates care
   about), Continuing Approval/Denial (transfers, extensions, amendments —
   what H-1B transfer candidates care about), NAICS, Tax ID, State, City,
   ZIP. The parser (`src/lib/jobs/h1b/parse.ts`) tolerates the header-name
   drift between years.

## Step 2 — send each file to the app

You need the `CRON_SECRET` env value (Vercel → project → Settings →
Environment Variables; same secret the daily cron uses).

Gzip first — Vercel caps request bodies around 4.5&nbsp;MB and a full-year
export can exceed that raw; gzipped it's well under:

```bash
export CRON_SECRET=…        # from Vercel env
export HOST=https://<your-prod-host>

for y in 2024 2025 2026; do
  gzip -kf h1b_datahubexport-$y.csv
  curl -X POST "$HOST/api/admin/h1b-ingest" \
    -H "authorization: Bearer $CRON_SECRET" \
    -H "content-type: text/csv" \
    -H "content-encoding: gzip" \
    --data-binary @h1b_datahubexport-$y.csv.gz
done
```

Local dev works the same against `http://localhost:3000` with `CRON_SECRET`
from `.env.local`.

Re-runs are safe: ingestion deletes and re-inserts each fiscal year found in
the file, so posting a corrected or refreshed export converges instead of
duplicating.

Three other body shapes the route accepts (all JSON,
`-H "content-type: application/json"`):
- `-d '{"url":"https://…csv"}'` — the server fetches the CSV itself. Worth
  one try; if Vercel's IPs are also Akamai-blocked it returns 502 and you
  fall back to the body upload.
- `-d '{}'` — skip ingestion, just re-match the catalog + re-apply evidence.
  Run this occasionally after the self-growing catalog has added companies,
  so newcomers pick up their track records between quarterly ingests.
- `-d '{"rescan_negatives": true}'` — the negative-signal backfill: re-reads
  already-enriched jobs' JDs for an explicit "we do not sponsor" statement
  and flips those to the red `NO SPONSORSHIP` chip (hidden from users who
  set "I need sponsorship"). JDs are keyword-screened in code, so the LLM
  only reads postings that mention visas at all. Each call is bounded
  (~400 LLM reads); the response reports
  `{"rescanned": {"scanned": …, "screened": …, "flipped": …}}` — repeat the
  call until `screened` is 0. New jobs get this check automatically during
  daily enrichment; the rescan is only needed once for the pre-existing
  corpus (or after tightening the prompt).

## Step 3 — read the response

```json
{
  "ok": true,
  "ingested": { "fiscalYears": [2025], "inserted": 61234, "skipped": 3 },
  "matched":  { "companies": 43, "matched_exact": 28, "matched_llm": 9, "unmatched": 6 },
  "applied":  { "companies": 31, "jobs_updated": 8400 }
}
```

- `ingested.skipped` — unparsable CSV lines (no employer / bad year); a
  handful is normal.
- `matched` — catalog companies joined to USCIS legal names: `matched_exact`
  by normalized equality, `matched_llm` via disambiguation, `unmatched`
  companies keep the JD-parse fallback chip. Unmatched is the safe state —
  never force a match.
- `applied.jobs_updated` — active jobs that flipped to `sponsors_verified`
  with an evidence snapshot, immediately visible in the feed.

## Step 4 — spot-check

- In the app: `/app/jobs` — big-tech/scale-up jobs (Stripe, Databricks,
  Coinbase…) should show `SPONSORS · <n> FILED FY<yy>`; small startups
  stay `VISA · TBD`. A job's detail page shows the full line
  ("… petitions decided in FY2025 · 96% approved · USCIS Employer Data Hub").
- In SQL, eyeball the joins (wrong matches are the one dangerous failure):

```sql
select name, h1b_employer_names, h1b_stats->>'last_filed_fy' as fy,
       h1b_stats->>'recent_filed' as filed
from companies where h1b_stats is not null order by (h1b_stats->>'recent_filed')::int desc;
```

If an LLM match looks wrong, null it out and it reverts to the fallback chip:

```sql
update companies set h1b_employer_names='{}', h1b_stats=null where id='…';
update jobs set visa_confidence=null, visa_evidence=null, enriched_at=null where company_id='…';
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `401 unauthorized` | Wrong/missing `CRON_SECRET` header. |
| `413` / body rejected | CSV posted raw; gzip it (Step 2). |
| `502 fetch … failed` on `{"url": …}` | USCIS blocking server IPs — expected; upload the body instead. |
| `unrecognized H-1B CSV header` | Wrong file (e.g. the DOL LCA disclosure xlsx). Use the Employer Data Hub CSVs. |
| Chips didn't change | Check `applied.jobs_updated`; if 0, the matched companies have no filings within the 2-FY recency window. |
| A red chip looks wrong | The JD parse flags explicit statements only, but spot-check the posting text; to revert one job: `update jobs set visa_confidence=null, visa_evidence=null, enriched_at=null where id='…'` (nightly enrichment re-evaluates it). |

## Cadence

USCIS refreshes ~quarterly (adding the current FY's newest quarter).
Repeat Steps 1–2 for the current fiscal year's file when they do; run the
`{}` re-match after notable catalog growth.
