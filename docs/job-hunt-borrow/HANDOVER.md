# Borrowing from career-ops + high-leverage-job-hunt — handover log

Five steps, shipped in order on one branch (one commit per step, one PR).
Each section below is written at the end of its step for whoever picks up the
next one: what landed, where it lives, what's live in the database, what's
deliberately left out, and what the next step can rely on.

| # | Step | Borrowed from |
|---|------|---------------|
| 1 | More job systems (Oracle, SmartRecruiters, Eightfold, iCIMS) | career-ops `providers/*.mjs` (MIT) |
| 2 | LinkedIn connections import → "people you know" | career-ops `docs/LINKEDIN_JOIN.md`; high-leverage-job-hunt Move 3 (warm path first) |
| 3 | Warm-intro request draft type in Compose | high-leverage-job-hunt Move 3 |
| 4 | Sharper cold-message rules in drafting prompts | high-leverage-job-hunt Move 3 |
| 5 | Find the right person for a job (connections + web search + Apollo + Compose) | career-ops `modes/contacto.md` |

---

## Step 1 — More job systems ✅

**Why:** the tracker could only follow companies on Greenhouse / Lever / Ashby /
Workday, so big employers showed "can't track yet". 676 of 1,324 universe
employers were unresolved. Goldman Sachs and JPMorgan Chase, for example, both
run Oracle Recruiting Cloud (Goldman behind its custom `higher.gs.com` front end).

### What landed

| File | What |
|------|------|
| `src/lib/jobs/sources/oracle.ts` | Oracle Recruiting Cloud. Slug `host/siteNumber`. US-filtered via the tenant's "United States" location facet, newest 300, lazy JD via the `ById` detail finder. |
| `src/lib/jobs/sources/smartrecruiters.ts` | SmartRecruiters Posting API. Slug = company id (lowercase). `country=us` when there are US postings, max 500, lazy JD. |
| `src/lib/jobs/sources/eightfold.ts` | Eightfold. Slug `tenant/domain`. Handles both the legacy `/api/apply/v2` API and the newer PCSX API (a tenant 403s the one it doesn't serve). US-filtered, newest 200 (10/page server cap), lazy JD. |
| `src/lib/jobs/sources/icims.ts` | iCIMS portal HTML (no JSON API). Slug = portal host. 10 pages max, lazy JD + real date from the posting's JSON-LD. |
| `src/lib/jobs/sources/http.ts` | Shared host-pinned fetch (browser UA, `redirect: "error"`), entity decode, JSON-LD reader. |
| `src/lib/jobs/sources/formats.ts` | One prompt block describing every ATS slug format — used by both LLM board guessers. |
| `src/lib/jobs/universe/verify.ts` | `verifyBoard()` — liveness + ownership per ATS (moved out of `resolve.ts` so scripts can use it). Opaque tenants (Oracle `hdpc`, iCIMS portals, Eightfold) must be named by the board's own text. |
| `src/lib/jobs/universe/probe.ts` | SmartRecruiters added to the slug probe (it exposes `company.name`); `canonicalSlug` knows Oracle. |
| `src/lib/jobs/universe/careers.ts` | Careers-page sniff recognizes Oracle / SmartRecruiters / Eightfold / iCIMS links. |
| `src/lib/jobs/universe/resolve.ts` | Uses `verifyBoard`, the shared formats prompt, reads URL-shaped LLM slugs, probes SmartRecruiters for every miss, and `RESOLVER_VERSION = 2` (below). |
| `src/lib/jobs/orchestrator.ts`, `hydrate.ts`, `util.ts` (`jdText`), `catalog/validate.ts`, `catalog/resolve.ts`, `catalog/index.ts` | Dispatch to the new adapters; generic lazy hydration (`isLazyHydrated`); catalog inserts use `canonicalSlug`. |
| `src/lib/kind-detect.ts` | Oracle Cloud / Eightfold / higher.gs.com URLs count as job links in Compose. |
| `src/lib/db/schema.ts` | `Ats` union + `ATS_VALUES`; `resolver_version` on `CompanyUniverse`. |
| `supabase/migrations/0033_enterprise_ats.sql` | Widens both ATS checks, seeds verified Goldman + JPMorgan boards, adds `company_universe.resolver_version`. |
| `THIRD_PARTY_NOTICES.md` | career-ops MIT notice (required — the four adapters are ports). |
| `src/lib/jobs/sources/enterprise.test.ts` | Pure-function tests for all four adapters + careers-page links. |

### Database state (applied to project `ccikbznbrjpruwiqzxib` via Supabase MCP)

- `0033_enterprise_ats` **applied**. `companies`/`jobs` ATS checks accept the 4 new values.
- Seeded and marked resolved: **Goldman Sachs Group** → `oracle:hdpc.fa.us2.oraclecloud.com/LateralHiring` (1,144 postings), **JPMorgan Chase** → `oracle:jpmc.fa.oraclecloud.com/CX_1001` (7,504).
- **Until this branch deploys**, the running app's `fetchBoard` returns `[]` for `oracle`, so those two show as trackable but fill with jobs only after deploy.
- The 676 unresolved employers get retried **by the new code only**: the new resolver treats `resolver_version < 2` rows as due with a fresh attempt budget. (A plain SQL reset would have let the old deployed resolver burn the retries on the old ATS list.) Drains ~60 rows per `jobs-fetch` tick, LLM spend bounded by `systemBudgetExhausted()`.

### Verified live (from this container)

| Board | Jobs fetched | Complete | Verify (as that company) | Hydrated JD |
|---|---|---|---|---|
| Oracle `hdpc…/LateralHiring` (Goldman) | 300 US | no (cap) | 1,144 ✅ | 4,183 chars |
| Oracle `jpmc…/CX_1001` | 300 US | no (cap) | 7,504 ✅ | 3,415 chars |
| SmartRecruiters `servicenow` | 410 US | yes | 701 ✅ | 17,597 chars |
| Eightfold `micron/micron.com` (PCSX) | 200 US | no (cap) | 2,954 ✅ | 10,341 chars |
| Eightfold `bayer/bayer.com` (legacy) | 200 US | no (cap) | 616 ✅ | 10,600 chars |
| iCIMS `careers-quest.icims.com` | 40 | yes | 40 ✅ | 7,368 chars |

Collision checks: Goldman's board does **not** verify as JPMorgan; ServiceNow's does not verify as Salesforce.

### Deliberately not done

- **SuccessFactors** — `jobs.sap.com`-style sites answer a Cloudflare challenge to server requests.
- **Phenom** — the `/widgets` API works, but careers pages sit behind Incapsula so we can't auto-detect tenants, and most Phenom sites front Workday (which we already read).
- **Wayfair** — `wayfair.com/careers` is behind a PerimeterX CAPTCHA; its board is a private Greenhouse behind that. Not reachable from a server. (Goldman *was* solvable: its custom site applies through Oracle.)
- Eightfold boards are slow (≈1 s per 10-row page; Bayer took 23 s for 200). Fine inside the time-budgeted `jobs-fetch` tick; lower `EIGHTFOLD_MAX_JOBS` if it crowds out other boards.

### For step 2

- Company identity for matching connections: `companies.name` / `normalized`, and `company_universe.name` / `match_key` (`normalizeEmployerName` in `src/lib/jobs/h1b/normalize.ts`). Use the same normalizer for a connection's company so "Goldman Sachs" ↔ "Goldman Sachs Group" match.
- Tracker cards come from `GET /api/jobs/tracker` (`src/lib/jobs/tracker.ts`), job detail from `GET /api/jobs/[id]`.

---

## Step 2 — LinkedIn connections → "people you know" ✅

**Why:** high-leverage-job-hunt's core move is a warm path in before a cold
application; career-ops cross-references a LinkedIn connections export against
target companies. We do that with the user's *own* export — no scraping, no
LinkedIn API, no ToS risk.

### What landed

| File | What |
|------|------|
| `src/lib/connections/csv.ts` | Browser-side parser for LinkedIn's `Connections.csv` (skips the "Notes:" preamble, RFC-4180 quotes, "15 Mar 2024" dates). **Drops email addresses** — they never leave the browser. |
| `src/lib/connections/match.ts` | `companyKey` / `companyCore` — match keys so "Goldman Sachs" ↔ "Goldman Sachs Group", "JPMorganChase" ↔ "JPMorgan Chase", "Scale AI" ↔ "Scale". Reuses `normalizeEmployerName` + probe.ts's `DROP_WORDS`/`DESCRIPTORS` (now exported). Filters "Self-employed", "Stealth", … |
| `src/lib/connections/store.ts` | Chunked import (`stageConnections`: rows land `pending`, the final chunk swaps them in atomically-enough — readers skip pending rows), `connectionsAt(names)`, `knownCounts(companyIds)`, `employerNames(companyIds)` (catalog name + universe name + aliases), `clearConnections`. |
| `src/app/api/connections/route.ts` | `GET` summary · `POST` one chunk (≤4,000 rows) · `DELETE` all. |
| `src/app/api/connections/at/route.ts` | `GET ?company_id=…&company=…` → `{ total, people, imported }`. |
| `src/components/paper/ConnectionsCard.tsx` | Settings card (anchor `#connections`): how to get the export, upload, progress, delete. |
| `src/components/jobs/PeopleYouKnow.tsx` | Reusable "YOU KNOW N PEOPLE HERE" card. Props `renderAction(person)` and `footer` are the hooks for steps 3 and 5. |
| `src/lib/jobs/tracker.ts` + `types.ts` | `TrackedCompany.known_count`, `TrackerDTO.connections_imported`. |
| `src/app/app/jobs/page.tsx` | Chips show "· N known"; filtering to a company shows its PeopleYouKnow card; import nudge when nothing is imported. |
| `src/app/app/jobs/[id]/page.tsx` | PeopleYouKnow card in the job's right rail (stacked on mobile). |
| `src/lib/analytics/events.ts` | `connections_imported {count}`, `connections_cleared`. |
| `supabase/migrations/0034_connections.sql` | `connections` table (no email column), `(user_id, company_core)` index, owner-only RLS. |
| `src/lib/connections/connections.test.ts` | Parser, email-drop, date/URL, and company-matching tests. |

### Database state

- `0034_connections` **applied** to `ccikbznbrjpruwiqzxib`. Empty table; nothing to backfill.

### Not verified here

- No browser run (the container has no Supabase/Anthropic env to boot `next dev`). Type-check, lint (no new errors; 5 pre-existing), and `npm test` (249 pass) are clean. **Worth a manual pass after deploy:** Settings → upload a real `Connections.csv` → tracker chips show "· N known" → a job page shows the card.

### For step 3 (warm-intro draft)

- Put the action on each person via `<PeopleYouKnow renderAction={(p) => …} />` — used on the job page (`src/app/app/jobs/[id]/page.tsx`) and the filtered tracker view (`src/app/app/jobs/page.tsx`).
- A person is `Connection` from `src/lib/connections/store.ts`: `{ id, full_name, linkedin_url, company, position, connected_on }`. We have **no email** for them by design — the intro ask is a LinkedIn DM (or email if Apollo/Hunter finds one in Compose).
- Compose entry points: `startRun(input, { kind })` in `src/lib/runs-store.ts` (the job page already uses it); intents flow through `POST /api/compose` → `src/lib/agents/reach-out`.
