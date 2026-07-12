# X posts log (build-in-public)

Dated log of the X (Twitter) posts for Jugaadu produced by the
`cofounder-x-poster` skill (`.claude/skills/cofounder-x-poster/`). The skill
**auto-posts** each one to @OpenStreetExch and records it here (and on the
"Jugaadu — X post queue" Notion page). Each entry notes whether it posted (with
the tweet link) or, if a run couldn't reach the X API, that it's unposted so the
founder can post it manually.

This folder is the **dedupe source**: the skill reads the recent entries before
writing so posts, shipped-item announcements, and featured agents don't repeat.

## Cadence

A Claude Code Routine fires **every 6 hours** (~00:00/06:00/12:00/18:00 UTC); each
run writes and posts **one** tweet, rotating what-shipped / proof / positioning /
one-live-agent, for **4 posts a day**. See `../README.md`.

## Format of each dated file

```
# X posts — YYYY-MM-DD

## 1 · what shipped
> <the post, ≤280 chars>
`<char count> chars · <one-line note: what/why, any link>`

## 2 · normal Tuesday proof
> ...

## 3 · positioning / insight
> ...

## 4 · <live agent name>
> ...
```

Guardrails every post must clear (enforced by the skill): ≤280 chars, one idea +
at most one link/CTA, 0–1 hashtag, and a clean pass through `lintAntiAi()`
(`src/lib/writing/anti-ai.ts`) — no AI tells, no forbidden phrases/words.
