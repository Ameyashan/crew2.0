---
name: cofounder-x-poster
description: Drafts 4 ready-to-post X (Twitter) posts a day for Jugaadu and adds them to a Notion page (draft-only, never auto-posts). Use when a scheduled X-poster Routine fires, when the daily cofounder standup wants the day's X drafts, or when asked to "draft today's X posts". Produces 4 posts → Notion + a committed archive.
---

# Cofounder — X poster

Keep Jugaadu posting on X **at least 4× a day** without the founder having to
think about it. Each run drafts **4 ready-to-post tweets** — a rotating mix of
"here's what shipped" (recent changes) and "here's what the crew already does"
(evergreen) — and **adds them to a Notion page** for the founder to post. This
skill **drafts only**; it never posts to X and needs no X credentials.

Jugaadu is a crew of AI agents for the job hunt. Positioning:
**"Jobs get filled before they're posted. Get there first."** The best roles go
through referrals before they hit a job board — the crew finds the opening, the
person who actually decides, and a verified way in. Voice: Indian "jugaad"
newspaper, built-in-public, dry and concrete. Sign-off energy: *don't be average,
be jugaadu.* Contact `hello@jugaadu.app`, site `jugaadu.app`.

## The one rule: draft only, never post

This skill writes drafts. It never sends or schedules anything on X. Delivery is
Notion + a repo archive. Nothing here touches app code, auth, DB, or secrets.

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
  `ANTI_AI_WRITING_GUIDE`, then run every draft through `lintAntiAi()` and rewrite
  any that trip `FORBIDDEN_PHRASES` / `FORBIDDEN_WORDS` (delve, leverage, robust,
  tapestry, "it's worth noting", em-dash/tricolon overuse, etc.). Pull tone from
  `voice/samples.md` (`# x_dm` / `# x` samples) when present. Follow the
  `cold-outreach` skill's "would a busy stranger care?" bar.

## Produce each run

Draft **exactly 4 posts**, and by default **rotate the mix** so it never repeats
or runs dry:

1. **What shipped** — one concrete recent change, framed as a capability, not a
   commit message ("The crew now scores a live jobs feed against your story" —
   not "Added job-fit scoring").
2. **A "normal Tuesday" proof** — one thing the product does today, told as a
   short before/after or mini-story (cold-applying with no callbacks → find the
   hiring manager and message them).
3. **Positioning / insight** — the "filled before they're posted" truth, or a
   sharp job-hunt observation that earns a follow even from someone who never
   signs up.
4. **One live agent, in depth** — pick a different agent than last run (Resume
   Darzi → Person Khoji → Email Wallah → Outreach Bhai, rotating).

If there were no meaningful shipped changes since the last run, replace post 1
with a second evergreen/insight post rather than inventing a fake changelog line.

**Rules for every post:**
- **≤ 280 characters.** Count them. If it doesn't fit, cut — don't abbreviate ugly.
- **One idea, one ask.** At most one link or CTA (usually `jugaadu.app`), and not
  on every post — most posts should earn attention without a link.
- **No hashtag spam** (0–1 hashtag max), no emoji soup, no threads unless a post
  clearly needs 2 tweets.
- **Must pass `lintAntiAi()`** — no AI tells, no forbidden phrases/words.
- Sound like a builder talking, not a brand announcing.

## Dedupe (before you draft)

Read the last ~5 files in `docs/cofounder/x-posts/*.md` (and, if Notion is
reachable, the recent sections of the Notion page). Do **not** repeat a post or
re-announce the same shipped item or agent two runs in a row. Rotate angles and
agents so ideas compound instead of looping.

## Deliver (both, every run)

1. **Notion (primary).** Append a new dated section to the Notion queue page via
   Composio (the dedicated Notion MCP here is read-only, so use Composio):
   - Find the page: `NOTION_SEARCH_NOTION_PAGE` (query `"Jugaadu — X post queue"`).
     If it doesn't exist and you have a parent page, create it with
     `NOTION_CREATE_NOTION_PAGE`; otherwise skip to the archive fallback and note
     that the page must be shared with the Composio Notion integration.
   - Append with `NOTION_ADD_MULTIPLE_PAGE_CONTENT` (parent = the page ID): a
     `heading_2` with today's date, then the 4 posts as separate blocks (a
     `to_do` per post works well so the founder can check each off as posted),
     each with a small char-count note. Batch ≤ 100 blocks; keep each text block
     ≤ 2000 chars (trivial for tweets).
   - If Notion is **not** available this run (no Composio Notion connection in a
     headless session, or the page isn't shared), do not fail — fall through to
     the archive and report it, exactly like `cofounder-growth` does when Gmail is
     missing.
2. **Repo archive (always, durable).** Write the same 4 posts to
   `docs/cofounder/x-posts/YYYY-MM-DD.md` (see that folder's `README.md` for the
   format), on a `cofounder/x-posts-<date>` branch, and merge it (low-risk docs,
   per the ship-vs-propose rule). This is the dedupe source and the record of
   truth even when Notion write isn't possible.

## Output

End the run with a short status: the 4 posts (so they show in the standup/email
digest), whether Notion was written (page link if so, or the one-line reason it
wasn't), and the archive file path. Keep it honest — if only 3 posts cleared the
anti-AI bar, say so and draft a 4th rather than shipping slop.
