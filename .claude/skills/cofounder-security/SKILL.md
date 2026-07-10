---
name: cofounder-security
description: Daily security pressure-test of the Jugaadu codebase. Use when running the daily cofounder standup (delegated by cofounder-orchestrator) or when asked to pressure-test/harden security or review the app for vulnerabilities. Ships low-risk mechanical fixes; proposes risky ones.
---

# Cofounder — security

Pressure-test Jugaadu's security posture and fix what's safe to fix. Bias to a
few high-confidence findings over a long speculative list. You may invoke the
repo's `/security-review` skill on the current diff as part of this.

## What to inspect (each run)

1. **New/changed API routes** (`src/app/api/**/route.ts`) since the last run:
   - Missing `withUser` on routes that read/write user data (helper in
     `src/lib/auth.ts`). Reference-only/public routes (`jobs/sectors`,
     `changelog`) are intentionally open — don't "fix" those.
   - Heavy/unauthenticated compute with no rate limit. Known standing item: the
     resume export routes (`src/app/api/resume/pdf/route.tsx`,
     `.../docx/route.ts`) are unauthenticated `POST`s that run `@react-pdf` /
     `docx`. Requiring auth is a **proposal** (confirm no signed-out export path
     first) — reuse the `src/lib/anon-rate-limit.ts` pattern for a rate limit.
2. **Auth guards that fail open.** The cron/webhook guards use
   `if (expected && auth !== …)`, which is skipped entirely when the secret env
   is unset (`src/app/api/cron/*/route.ts`, `src/app/api/inbound/reply/route.ts`).
   Flipping these to **fail-closed** is a **proposal** — it breaks crons/inbound
   if `CRON_SECRET`/`INBOUND_WEBHOOK_TOKEN` aren't set in Vercel prod, so it needs
   the founder to confirm those env vars first. (The pattern to copy is the
   fail-closed check in `src/app/api/admin/analytics/route.ts`.)
3. **RLS.** All tables through the latest migration currently have RLS enabled
   with owner-or-service-role policies. Verify with the Supabase advisors
   (`get_advisors`, type `security`) and confirm every NEW migration since last
   run enables RLS. Owner tables use `auth.uid() = user_id`; global/reference
   tables (`companies`, `jobs`, `anon_run_events`, `product_events`) enable RLS
   with **no** policy (service-role only). Only write a migration if advisors flag
   a real gap; migrations are additive + idempotent.
4. **Input validation.** No schema lib today. Untrusted boundaries (inbound
   webhook, export payloads, the `product_events` ingest) do ad-hoc checks.
   Introducing `zod` there is a **proposal** — start with `safeParse`
   log-and-allow before hard-reject so real payloads aren't dropped.
5. **Headers / CSP.** `next.config.ts` ships a Report-Only CSP + the standard
   headers. Watch the CSP report stream; only propose flipping to enforcing
   (`Content-Security-Policy`) once reports are clean. Nonce-based strict CSP via
   `src/proxy.ts` is a larger proposal.
6. **Dependencies.** Run `npm audit --production`; flag high/critical. Bumping a
   patch of a vulnerable transitive dep is low-risk; a major bump is a proposal.
7. **Secrets.** Confirm nothing secret is committed (`.env*` is gitignored). Never
   print secret values.

## Output
- Mechanical, provably-safe fixes (add a missing `withUser` to a clearly
  user-scoped new route, tighten an obviously-wrong check) → PR, auto-merge if
  build+lint+tests pass.
- Anything in the "proposal" buckets above → write
  `docs/cofounder/security/YYYY-MM-DD.md` with the finding, the exact fix, the
  risk, and the one thing you need from the founder to proceed. Do not ship it.
