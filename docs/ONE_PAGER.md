# Jugaadu — One Pager

> **A personal OS for the ambitious.**
> A crew of AI agents that run your job hunt and career growth — finding the
> opening, the person who decides, and a verified way in, so you get there
> before the role is ever posted.

*(Repo: `crew2.0` · Domain: `jugaadu.app` · "Jugaadu" = someone who gets things
done with a clever hack — a jugaad.)*

---

## What it is

Jugaadu is a web app (Next.js 16 / React 19 / Supabase / Anthropic) where you
sign in with Google and hand a job hunt to a **crew of AI agents**. You paste a
job link, drop a screenshot, or just type what you want, and the crew does the
research-and-outreach grind for you — the work that normally eats a weekend per
application.

It began life as **Crew v1 — "Reach Out"**, a single-user outreach copilot
(paste a name/LinkedIn/X post → research the person, find their email, draft in
your voice, track follow-ups). It has since grown into a multi-user,
Google-auth product with a full job-hunt pipeline and a warm "paper"
newspaper-style UI (the *Jugaadu reskin*).

## What it does

Give the crew one input and it runs up to **five specialist agents**, each of
which you can toggle on or off per run:

| Agent | What it produces |
|---|---|
| **Resume** (the *darzi* / tailor) | Tailors your resume to the specific JD, scores the ATS fit, and can export a formatted `.docx`/`.pdf` — optionally driven by your own custom resume-writer Agent Skill. |
| **Person** | Finds the actual hiring manager / decision-maker behind the role. |
| **Email** | Locates a **verified** email for that person (via Apollo / Hunter people-match), tiered by confidence. |
| **Outreach** | Drafts the message **in your voice** across three channels — email, X DM, LinkedIn — from few-shot voice samples. |
| **Application** | Drafts answers to the posting's application questions. |

Around that core run sit the surfaces that make it a system, not a one-shot tool:

- **Desk** — the composer + your earlier runs. Try it before signing in; results
  blur behind a sign-in gate.
- **Jobs** — a scanned, scored feed of roles matched to your preferences.
- **Story** — your memory layer: resume, accomplishments, and what you've
  shipped, which every agent draws on (an empty Story triggers a "the crew is
  guessing" nudge).
- **People** — your contacts and a per-person timeline of every interaction.
- **Today / Follow-ups** — what's due and what needs review; a `no_reply` auto-
  schedules a follow-up and pre-drafts it. A daily digest cron snapshots it all.

Nothing sends automatically — the human stays in the loop, copying drafts and
opening Gmail themselves.

## The vision

**Get ambitious people to the role before it's ever posted.** Most good jobs are
won through research, the right person, and a credible warm intro — not through
the "apply" button. Jugaadu automates that hidden work so an individual can run
their career the way a well-staffed team would: an always-on crew that knows
your Story, finds the opening and the decision-maker, and gives you a verified
way in.

The longer arc is a **personal OS for the ambitious** — a persistent memory of
who you are and what you've done, with agents that compound that context over
time across the whole job hunt and career, not just a single application.

## Built in public, with an AI cofounder

Jugaadu is itself run partly by AI. A **"Jugaadu Cofounder"** — an orchestrator
plus specialist Agent-Skill workers on scheduled Routines — moves the product
forward a little every day: daily security pressure-tests, SEO, analytics and
funnel review, growth ideas, weekly market analysis, and a build-in-public tweet
every six hours. Each worker either ships a small (auto-merged, low-risk) PR or
emails the founder a brief, closing with a standup digest of what shipped and the
single biggest next lever.

---

*Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
Postgres/Auth · Anthropic Claude (research w/ web search, drafting, resume
tailoring, Agent Skills) · Apollo & Hunter for email lookup · Vercel.*
