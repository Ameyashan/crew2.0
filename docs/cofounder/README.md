# The Jugaadu Cofounder

An autonomous "pseudo-cofounder" that moves the product forward a little every
day so the founder doesn't have to hold it all in their head. It's built as an
**orchestrator + specialist workers**: a scheduled session wakes up, decides what
to do, and delegates each responsibility to a focused playbook (an Agent Skill).
Each worker either **ships a small change** (a PR, auto-merged when low-risk) or
**writes a brief** (emailed + archived here).

## Responsibilities & cadence

| Cadence | Responsibility | Skill | Output |
|---|---|---|---|
| Daily | Security pressure-test + fix | `cofounder-security` | PR (mechanical) / brief (risky) |
| Daily | SEO improvements | `cofounder-seo` | PR (metadata) / brief (strategy) |
| Daily | User activity & journey review, add missing tracking | `cofounder-analytics` | PR (new tags) / brief (funnel) |
| Daily | Marketing & outreach ideas | `cofounder-growth` | brief |
| Weekly | Market & competitive analysis | `cofounder-market-analysis` | brief |
| — | Manager: decides, delegates, reports | `cofounder-orchestrator` | standup digest |

## How it runs

Two scheduled **Routines** (Claude Code cron triggers) spin up a fresh session:

- **Daily** (~08:00) → invokes `cofounder-orchestrator` with `mode=daily`
  (security, seo, analytics, growth).
- **Weekly** (Mon ~08:00) → `mode=weekly` (adds market-analysis).

Each run ends with a **standup digest**: what shipped, what needs the founder's
call, the briefs, and the single biggest next lever — emailed to
ameya.shanbhag@gmail.com (a copy of every brief is committed under
`docs/cofounder/<area>/`).

### Run it manually
In any Claude Code session on this repo:
> "Run the cofounder standup (mode=daily)"

or invoke a single specialist, e.g. "run cofounder-seo".

## Ship-vs-propose (the safety rule)

- **Auto-merge (low-risk):** SEO metadata, new analytics `track()` calls, docs/
  briefs — only after `npm run build && npm run lint && node --test "src/**/*.test.ts"`
  pass in-session (there is no CI).
- **PR for review (risky):** anything touching auth, security headers/CSP
  enforcement, DB migrations/RLS, env/secrets, or billing/gating. The cofounder
  never merges these — the founder does.
- Every change lands on a `cofounder/<area>-<slug>` branch off the default
  branch. Nothing is committed to the default branch directly and nothing
  deploys without a human merge.

## What's already built (the foundation)

- **Analytics event layer** — `src/lib/analytics/` (typed registry + client/server
  `track`), ingest `POST /api/events`, first-party `product_events` table
  (migration `0014`), and a headless-safe read API
  `GET /api/admin/analytics` (Bearer `ADMIN_ANALYTICS_SECRET`). Instrumented so
  far: `run_completed`, `resume_export`, `signup`/`sign_in`, `onboarding_complete`.
- **SEO** — `sitemap.ts`, `robots.ts`, full OpenGraph/Twitter + title template in
  `src/app/layout.tsx`, per-page metadata layers for `/home` and `/changelog`,
  Organization/SoftwareApplication JSON-LD, a dynamic OG card, and `noindex` on
  the private app.
- **Security headers** — `next.config.ts` ships HSTS, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and a CSP in
  **Report-Only** mode.

## Open follow-ups needing a founder decision

These were deliberately **not** auto-shipped (they can break prod):

1. **Set env vars, then fail-close the guards.** Confirm `CRON_SECRET` and
   `INBOUND_WEBHOOK_TOKEN` are set in Vercel prod, then flip the
   `if (expected && …)` cron/webhook guards to fail-closed.
2. **`ADMIN_ANALYTICS_SECRET`** — set this in Vercel (and in the cofounder's
   environment) to enable the analytics read API. Until then it returns 503.
3. **Enforce CSP** — after one clean deploy of the Report-Only report stream,
   flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.
4. **Auth + rate-limit the resume export routes** — confirm there's no signed-out
   export path first.
5. **Confirm the prod domain** for `metadataBase` (assumed `https://jugaadu.app`;
   override per-env with `NEXT_PUBLIC_SITE_URL`).

## Layout
```
.claude/skills/cofounder-*/SKILL.md   the playbooks
docs/cofounder/<area>/YYYY-MM-DD.md   dated briefs (the durable record)
docs/cofounder/queries/*.sql          read-only analyst queries
src/lib/analytics/                    the event layer the analyst uses
```
