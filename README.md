# Crew v1 — Reach Out (personal build)

Personal outreach copilot. Paste a name, a LinkedIn URL, or an X post; Crew researches the person, finds a likely email via Apollo, drafts in your voice across email / X DM / LinkedIn, tracks every send, and reminds you to follow up.

Built per the prompts in `../crew_prompts.md`. Single-user, no auth, no payments. Designed to be run locally and self-hosted on Vercel.

## Stack

- **Next.js 16 / App Router** + TypeScript
- **Tailwind v4**, custom theme tokens (cream / clay / ink) inspired by the prototype
- **Supabase Postgres** (project `ccikbznbrjpruwiqzxib`)
- **Anthropic SDK** — `claude-sonnet-4-6` for research (with web_search) and drafting
- **Apollo people-match** for email lookup

## Run

1. Fill `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   APOLLO_API_KEY=...
   SUPABASE_URL=https://ccikbznbrjpruwiqzxib.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...   # or use the anon publishable key, since RLS is off
   CRON_SECRET=anything-long
   RESUME_SKILL_ID=skill_...       # optional — custom resume-writer Agent Skill (see "Resume darzi skill")
   ```
2. `npm run dev`
3. Open <http://localhost:3000>.

The Supabase migration in `supabase/migrations/0001_init.sql` has already been applied to the project; re-run only on a fresh project.

## Routes

- `/` — Compose. Paste, research, draft 3 channels, copy & open Gmail.
- `/today` — Followups due + conversations needing review. Keyboard: `j`/`k` move, `r`/`n` mark replied/no-reply, `Enter` open.
- `/people` — Searchable contacts.
- `/people/[id]` — Per-person timeline (the seed of the memory layer).

## API

- `POST /api/compose` — `{ text, intent? }` → research + drafts.
- `POST /api/draft/[id]/sent` — mark draft sent, log interaction.
- `GET  /api/today` — feeds the Today page.
- `POST /api/review` — `{ interaction_id, outcome: 'replied' | 'no_reply' }`. `no_reply` schedules a 5-day followup and pre-drafts it.
- `POST /api/followup/[id]/sent` — mark a followup sent.
- `GET  /api/cron/daily-digest` — snapshots pending followups/reviews. Wired in `vercel.json` to `0 12 * * *` (≈ 8 AM ET). Test locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-digest`.

## Voice

Edit `voice/samples.md` directly. Each fenced block is a sample; an optional first-line `# email` / `# x_dm` / `# linkedin` scopes it to that channel. Drafts pull samples in as few-shot context per call. Cache invalidates on file mtime change.

## Resume darzi skill

The resume *darzi* (`src/lib/agents/resume-tailor`) can run on top of a custom **Agent Skill** — your own `resume-writer` skill that encodes how you like your resume written. Skills are filesystem-based and run inside Claude's code-execution container, so two things are required:

1. **Upload the skill to the Claude API.** Custom Skills don't sync across surfaces, so a skill you built in Claude Code or claude.ai has to be uploaded to the API separately. Point the helper at the skill folder (the directory containing `SKILL.md`):
   ```
   ANTHROPIC_API_KEY=sk-ant-... node scripts/upload-resume-skill.mjs ./path/to/resume-writer
   ```
   It prints a `skill_id` (e.g. `skill_…`).
2. **Set `RESUME_SKILL_ID`** to that id. When present, the darzi adds the code-execution tool + the `code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14` betas and loads the skill via `container.skills`. When absent, it falls back to the plain `web_search` tailoring path — no behavior change.

The darzi still returns the strict `TailoredResume` JSON (the app renders, previews, scores, and exports from it). If the skill also writes a formatted file (`.docx`/`.pdf`) in the container, the `file_id` is surfaced on the tailor stream as an `artifact` event and persisted in `resume_generations.meta.artifacts`; download it via `GET /api/resume/skill-file?file_id=…`.

> Note: skills run in the code-execution container, which has **no network access** — the skill's own scripts can't fetch the job URL. The darzi still reads the posting with the `web_search` server tool and feeds it in, so keep the job-URL flow as the source of the JD. This composition (web_search + code_execution + skills in one request) is worth a live smoke-test before relying on it.

## What's deliberately not here (per the prompts)

No automated send, no Gmail OAuth, no auth, no multi-tenant, no link redirector / click tracking, no BCC tracking, no marketing site, no onboarding, no settings UI, no mobile polish, no dark mode toggle.

## Vision and prompts

See sibling files `../crew_vision.md` and `../crew_prompts.md`. The prototype `../crew_prototype.html` is the visual reference.
