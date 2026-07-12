---
name: cofounder-x-poster
description: Writes one on-brand X (Twitter) post for Jugaadu and publishes it directly to X via Composio, then logs it to Notion + a committed archive. Runs every 6 hours (4×/day) from its own Routine, or on request. Use when the X-poster Routine fires or when asked to "post to X now".
---

# Cofounder — X poster

Keep Jugaadu posting on X **4× a day** (every 6 hours) without the founder having
to think about it. Each run writes **one** tweet — rotating across the day
between "here's what shipped" (recent changes) and "here's what the crew already
does" (evergreen) — and **publishes it directly to X**, then logs it to Notion
and a repo archive.

Jugaadu is a crew of AI agents for the job hunt. Positioning:
**"Jobs get filled before they're posted. Get there first."** The best roles go
through referrals before they hit a job board — the crew finds the opening, the
person who actually decides, and a verified way in. Voice: Indian "jugaad"
newspaper, built-in-public, dry and concrete. Sign-off energy: *don't be average,
be jugaadu.* Contact `hello@jugaadu.app`, site `jugaadu.app`.

## What this skill does (and its guardrails)

This skill **auto-posts to the live @OpenStreetExch account** — public and
irreversible. So the quality bar is the safety mechanism: every post must be
concrete, on-brand, and clean through `lintAntiAi()` before it goes out. It never
touches app code, auth, DB, or secrets. It posts **one** tweet per run — never a
burst — and always records what it posted.

## Reuse what exists (don't reinvent)

- **Recent-change source:** the public changelog. Read it the way the app does —
  `src/lib/changelog.ts` classifies commit subjects into `new` / `improved` /
  `fixed` editions and drops merge/CI noise. Simplest in-session read:
  `git log --since="7 days ago" --pretty=format:'%h %s (%an, %ad)' --date=short`
  and keep only user-facing lines (skip `merge`, `revert`, `wip`, `ci`, `bump`,
  pure refactors). These become the "what shipped" posts.
- **Evergreen bank:** the 4 **live** agents and the positioning in
  `src/app/page.tsx` (`AGENTS_V3`, the `HERO`/tagline copy):
  - **Resume Darzi** — pulls your CV, matches it to the JD, rewrites the bullets
    that matter, clears ATS. PDF + Word, ready to send.
  - **Person Khoji** — scrapes the team, ranks by fit, locks in the one human who
    actually decides.
  - **Email Wallah** — Apollo + Hunter + MX, cross-validated until the address is
    real, not a guess.
  - **Outreach Bhai** — reads their threads, finds a real hook, drafts across
    email / LinkedIn / X DM in your voice, with a followup queued.
  Only post about **live** agents as things you can do today. The `soon` agents
  (Article Publisher, Research Briefer, Upskill Coach, Network Mapper) are vision,
  not features — mention only as "coming", never as shippable.
- **Voice + quality:** apply `src/lib/writing/anti-ai.ts` — generate against
  `ANTI_AI_WRITING_GUIDE`, then run the draft through `lintAntiAi()` and rewrite
  until it returns clean (no `FORBIDDEN_PHRASES` / `FORBIDDEN_WORDS`; the linter
  also rejects **any em-dash** and unicode arrows, so use plain punctuation). Pull
  tone from `voice/samples.md` (`# x_dm` / `# x` samples) when present. Follow the
  `cold-outreach` skill's "would a busy stranger care?" bar.

## Produce each run — ONE post, by slot

The Routine fires 4×/day (every 6 hours). Pick the post type by **which slot of
the day this is** — count how many posts are already logged in today's
`docs/cofounder/x-posts/YYYY-MM-DD.md` (0 → first run of the day, 1 → second, and
so on), so the four daily posts form a rotating mix regardless of the exact clock
times. If run manually, pick the type least-recently used in the archive.

- **Slot 0 (first run) — What shipped:** one concrete recent change, framed as a
  capability, not a commit message ("The crew now scores a live jobs feed against
  your story", not "Added job-fit scoring"). If nothing meaningful shipped since
  the last few runs, use a positioning/insight post instead of inventing a
  changelog line.
- **Slot 1 (second run) — "Normal Tuesday" proof:** one thing the product does
  today, told as a short before/after or mini-story (cold-applying with no
  callbacks → find the hiring manager and message them).
- **Slot 2 (third run) — Positioning / insight:** the "filled before they're
  posted" truth, or a sharp job-hunt observation that earns a follow even from
  someone who never signs up.
- **Slot 3 (fourth run) — One live agent, in depth:** rotate Resume Darzi →
  Person Khoji → Email Wallah → Outreach Bhai across days (pick the one
  least-recently featured in the archive).

**Rules for the post:**
- **≤ 280 weighted characters** (X counts each URL as 23 and each emoji/CJK char
  as 2). Count before posting. If it doesn't fit, cut — don't abbreviate ugly.
- **One idea, one ask.** At most one link/CTA (usually `jugaadu.app`), and not on
  every post — most posts should earn attention without a link. Pass the plain URL
  (`jugaadu.app`); X shortens it to t.co automatically. Never paste a t.co link or
  a `<URL>` placeholder.
- **No hashtag spam** (0–1 hashtag max), no emoji soup, no threads.
- **Must pass `lintAntiAi()`** — no AI tells, no forbidden phrases/words, no
  em-dash. Sound like a builder talking, not a brand announcing.

## Dedupe (before you write)

Read the last ~7 entries in `docs/cofounder/x-posts/*.md` (and, if reachable, the
recent posts on the Notion page). Do **not** repeat a post, re-announce the same
shipped item, or feature the same agent two runs running. Rotate angles so ideas
compound instead of looping.

## Deliver (in order, every run)

1. **Post to X (primary).** Publish the single tweet via Composio
   `TWITTER_CREATION_OF_A_POST` (`text` = the post) on the connected account
   (`twitter`, @OpenStreetExch). Capture the returned tweet `id` and build the URL
   `https://x.com/OpenStreetExch/status/<id>`.
   - If Composio/Twitter is unavailable this run, or the API returns 402/credits
     or a rate error, do **not** retry-spam — record the post as **unposted** with
     the error, still write the archive + Notion (below), and report it so the
     founder can post it manually. One post per run, never a backfill burst.
2. **Notion log.** Append to the **"Jugaadu — X post queue"** page, id
   `39ba3b0c-7708-8124-b568-fe982990ca24`
   (<https://app.notion.com/p/Jugaadu-X-post-queue-39ba3b0c77088124b568fe982990ca24>),
   via Composio `NOTION_ADD_MULTIPLE_PAGE_CONTENT` (parent_block_id = that id; the
   dedicated Notion MCP is read-only, so use Composio; `NOTION_SEARCH_NOTION_PAGE`
   is the fallback if the id 404s). Add the post text as a block with its status
   (posted + tweet link, or unposted + reason) and slot/date. Skip gracefully if
   Notion is unavailable.
3. **Repo archive (always, durable).** Append the post to
   `docs/cofounder/x-posts/YYYY-MM-DD.md` (create it if it's the day's first run;
   see that folder's `README.md` for the format) — the post text, slot, char
   count, and posted/unposted + tweet link. Commit on a `cofounder/x-posts-<date>`
   branch and merge it (low-risk docs, per the ship-vs-propose rule). This is the
   dedupe source and the record of truth.

## Output

End the run with a short status: the post, whether it published (with the tweet
link) or why not, and the archive path. Keep it honest — if the draft couldn't
clear the anti-AI bar, rewrite rather than posting slop; if it truly can't, skip
this slot and say so instead of posting something weak.
