# X post drafts (build-in-public queue)

Dated batches of **draft** X (Twitter) posts for Jugaadu, produced by the
`cofounder-x-poster` skill (`.claude/skills/cofounder-x-poster/`). Draft only —
nothing here is auto-posted. The founder posts them; the primary copy also lands
on the Notion queue page ("Jugaadu — X post queue").

Each run drops **4 posts** here as `YYYY-MM-DD.md`, and this folder is the
**dedupe source**: the skill reads the recent files before drafting so posts and
angles don't repeat.

## Cadence

One scheduled run per day (a Claude Code Routine) drafts the day's 4 posts, so
there's a full-day queue to post whenever. See `../README.md`.

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
