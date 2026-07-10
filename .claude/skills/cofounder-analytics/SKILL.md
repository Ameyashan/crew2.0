---
name: cofounder-analytics
description: Daily user-activity and journey review for Jugaadu, plus adding analytics tags for things not yet tracked. Use in the daily cofounder standup (delegated by cofounder-orchestrator) or when asked to review signups/users/activity/funnels or add tracking. Ships new tracking instrumentation; briefs the funnel read.
---

# Cofounder — analytics

Understand who signed up, what they did, and where they drop off — then close the
gaps in what we measure. Two data sinks exist and are wired together in
`src/lib/analytics/` (registry `events.ts`, `client.ts` `track()`, `server.ts`
`trackServer()`): GA4 (the `G-0DYRW30JVJ` property) and the first-party
`product_events` table (migration `0014`). Rich cost/usage telemetry also lives
in `agent_runs`, and interaction counts in `interactions`.

## How to read the data (headless-safe)
Primary: `GET /api/admin/analytics?days=30` with header
`Authorization: Bearer $ADMIN_ANALYTICS_SECRET`. It returns pre-aggregated JSON
(totals, signup/onboarding/blur-gate funnel, per-agent run volume + errors +
spend, signups-by-day, and `tracked_events` = the event names currently seen).
This works even when the Supabase MCP isn't authorized in a cron run.

Secondary (when Supabase MCP is available): run the read-only queries in
`docs/cofounder/queries/*.sql` via `execute_sql`.

## What to do (each run)
1. **Pull the summary** and compare to prior days (yesterday's brief in
   `docs/cofounder/analytics/`). Note new signups, active users, per-agent usage,
   error-rate spikes, and cost.
2. **Trace journeys** — for the funnel `blur_gate_hit → sign_in/signup →
   onboarding_complete → run_completed → resume_export`, find the biggest
   drop-off. That's the week's growth lever.
3. **Find untracked actions** — the highest-value part of this role. Compare the
   `tracked_events` list against the real product surfaces (routes under
   `src/app/app/**`, key buttons/CTAs). Anything a user does that we can't see in
   `product_events` is a gap. Examples likely still missing:
   `blur_gate_hit`/`blur_gate_signin_click` on the landing/blur-gate component,
   job-feed views, draft sent, followup scheduled, settings changes.
   - **Add the tag**: import `track` (client) from `@/lib/analytics/client` or
     `trackServer` from `@/lib/analytics/server`, add the event name to the
     registry in `src/lib/analytics/events.ts`, and call it at the action site.
     Adding instrumentation is **low-risk → PR + auto-merge** once build passes.

## Output
- New `track()`/`trackServer()` instrumentation → PR (auto-merge if green).
- Funnel read + the one drop-off to fix → brief at
  `docs/cofounder/analytics/YYYY-MM-DD.md`, emailed in the standup digest.
- Never put PII (names, emails, raw resume text) in briefs or events — aggregates
  and ids only.
