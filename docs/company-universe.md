# Company universe: tracking the Fortune 500, top startups and top H-1B sponsors

The jobs feed scans a curated list of ~1,300 employers (the union of the
Fortune 500, the top 500 startups by valuation and the top 500 H-1B sponsors),
in addition to whatever each user's sectors, pins and follows add. This doc
explains how the pieces connect, how to deploy it, and how to refresh the list.

## How it fits together

```
data/company-universe.csv ──► classify.ts ──► company_universe (1 row / employer)
   (sheet export)               fold subsidiaries,      list flags + ranks → feed badges
                                org type, sectors,      USCIS entities     → H-1B matching
                                size                    org_type           → staffing filter
                                                        resolve_status     → board discovery
                                         │
        board discovery (resolve.ts)     ▼
        slug probe → LLM guess → careers page ──► companies (scannable boards,
        (Greenhouse / Lever / Ashby / Workday)        universe_id → company_universe)
                                                         │
        /api/cron/jobs-fetch (every 10 min)              ▼
        fetch stale boards → jobs → enrich ──► per-user select + score ──► feed
```

* **`src/lib/jobs/universe/classify.ts`**: parses the CSV and folds
  subsidiaries into their parent (CVS Pharmacy + Caremark + Aetna → CVS
  Health). It also cleans USCIS-style names, classifies each employer
  (`company` / `staffing` / `academic` / `hospital`), maps the sheet's
  industry to interest sectors and derives a size bucket. The same code runs
  in the build scripts and the app.
* **Board discovery.** `probe.ts` tries name slugs on Greenhouse, Lever and
  Ashby. `resolve.ts` asks the model for board guesses (including Workday
  `tenant/wdN/site`). `careers.ts` scans the employer's careers page for
  board links. Every guess is **verified against the live board** before
  it's trusted:
  * Greenhouse, Lever and Ashby boards must name the company.
  * Large employers need 20+ postings. That rejects "Post Holdings →
    ashby:post" collisions.
* **`src/lib/jobs/sources/workday.ts`**: the Workday adapter. It takes the
  newest 300 postings, filtered to the US when the tenant exposes a country
  facet. Descriptions are hydrated lazily (`hydrate.ts`) for jobs that get
  enriched, scored or opened.
* **`src/lib/jobs/universe/sectors.ts`**: one model call per 60 employers
  tags them with interest sectors. The sheet's "Enterprise Tech" can't tell
  AI from security.
* **Feed.** Users with **Top employers** on (the default) get title-matching
  roles from every universe employer (`scan.ts: universeRoleJobs`). Cards
  show why the employer is tracked ("Fortune 500 #12", "Top-100 H-1B
  sponsor"). **Staffing firms** (TCS, Infosys, Cognizant, …) are hidden
  unless the user opts in; pins and follows always count.

## Scale: who runs what

| Job | Schedule | Budget | Does |
|---|---|---|---|
| `/api/cron/jobs-fetch` | every 10 min | ~275 s | 1. fetch boards not refreshed in 20 h (most-stale first)<br>2. resolve ~25 universe rows, then H-1B-match newly linked boards<br>3. one sector-tagging batch<br>4. score users the daily scan couldn't fit<br>5. drain the enrichment backlog |
| `/api/cron/jobs-scan` | daily 11:00 UTC | ~270 s | catalog coverage, top-up fetch, then score users oldest-first until the deadline |
| Feed **Refresh** | on demand | ~300 s | the user's 25 stalest boards, then select + enrich + score |

* **Boards.** Each board carries `last_fetched_at`, `fetch_error` and
  `fetch_failures`. After 5 consecutive failures the board is deactivated. If
  it was a universe employer, that employer goes back to `pending` so the
  resolver can find where it moved.
* **Scoring.** `job_scan_state` is the per-user scoring cursor, with an
  atomic claim so overlapping runs never score the same user twice.
* **Enrichment.** Candidates are enriched right before scoring
  (`enrichCandidates`), so the visa and size chips users see are always
  filled in. The global drain handles the rest.

## Deploying

1. Apply migrations **in order**. 0027 widens the ATS checks, and the seed
   (0028) contains Workday boards that need it:
   * `0026_company_universe`: tables and columns
   * `0027_workday_ats`: allows `ats = 'workday'`
   * `0028_company_universe_seed`: **generated**. About 1.3k universe rows
     and the pre-verified boards.
   * `0029_job_preferences_universe`: the two new preferences
   * `0030_companies_fetch_state`: fetch state and the scoring cursor
2. Deploy the app at the same time. The new cron schedule in `vercel.json`
   ships with it. Don't leave the seed applied on the old code for long: the
   old daily scan fetches every board in one request.
3. Watch progress. Each `jobs-fetch` tick returns queue depths
   (`stale_boards`, `unresolved_universe`, `unenriched_jobs`). Or ask
   directly:

   ```bash
   curl -H "authorization: Bearer $CRON_SECRET" https://<host>/api/admin/universe
   # drain discovery faster than the cron (repeat until "considered": 0):
   curl -X POST -H "authorization: Bearer $CRON_SECRET" -H "content-type: application/json" \
        -d '{"action":"resolve","limit":60}' https://<host>/api/admin/universe
   ```

   The first fetch of every board takes a few ticks, about an hour. Discovery
   for the unresolved rows takes a few hours at 25 rows per tick.

## Refreshing the list

1. Re-export the "All Companies (Unique)" sheet to `data/company-universe.csv`,
   keeping the same headers. The parser tolerates small header drift.
2. `node scripts/probe-company-boards.ts`. This slug-probes new employers and
   needs only outbound HTTPS, no secrets.
3. Optional: pass board guesses to `node scripts/verify-board-guesses.ts
   guesses.json`, in the format documented in the script.
4. `node scripts/build-company-universe.ts --out=supabase/migrations/00NN_company_universe_refresh.sql`.
   Every statement is an upsert. Replaying it keeps resolver progress and
   refined sectors.
5. `node --test src/lib/jobs/universe/classify.test.ts`. It checks the
   fold/rename maps still match real rows. Update `FOLD_INTO` / `RENAME` /
   `STAFFING` in `classify.ts` if the new sheet renames employers.

## Known gaps

* **Own careers systems.** Amazon, Apple, Google, Microsoft and Meta run their
  own. Others use Oracle/Taleo, SuccessFactors, iCIMS, Eightfold, Phenom or
  SmartRecruiters. None of these are scannable yet, and they stay
  `unresolved` with a note. Each needs its own adapter; amazon.jobs and
  SmartRecruiters have public JSON APIs and would be the cheapest next wins.
* **Workday country filter.** Workday boards without a country facet are
  fetched unfiltered (the newest 300 worldwide). The feed's location filter
  still applies.
* **`academic` rows.** Universities and national labs are tracked but
  sector-less. They show up through the title-matched universe pool.
