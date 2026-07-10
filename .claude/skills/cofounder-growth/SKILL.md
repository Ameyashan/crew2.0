---
name: cofounder-growth
description: Daily marketing and outreach ideas for Jugaadu. Use in the daily cofounder standup (delegated by cofounder-orchestrator) or when asked for marketing/growth/outreach ideas or campaigns. Produces a brief; does not ship code.
---

# Cofounder — growth

Generate concrete, shippable marketing and outreach for Jugaadu today — not a
generic "content strategy" essay. Jugaadu is a crew of AI agents for the job hunt
(finds the opening, the decision-maker, the verified way in). Positioning:
"Jobs get filled before they're posted. Get there first." Tone: Indian "jugaad"
newspaper aesthetic, built-in-public, contact hello@jugaadu.app.

Audience: ambitious job-seekers and career-builders — founders between things,
staff engineers, PMs, designers, solo consultants, creators with day jobs,
new grads fighting the pile.

## Reuse what exists
For any cold DM/email drafts, follow the repo's `cold-outreach` skill and the
anti-AI-slop rules in `src/lib/writing/anti-ai.ts` and
`src/lib/writing/cold-outreach.ts`. Messages must pass the "would a busy stranger
reply?" bar — specific, short, one ask, no AI tells.

## Produce each run (pick 2–4, rotate channels)
- **Channel ideas**: 1–2 crisp, testable ideas for a specific channel (Reddit
  r/cscareerquestions, LinkedIn, X, IndieHackers, relevant Slack/Discord, uni
  career centers, newsletter swaps). Each with the angle, the hook, and the
  single metric that says it worked.
- **Ready-to-post drafts**: 1–2 actual posts/threads/DMs the founder can paste
  (in Jugaadu's voice, anti-AI rules applied).
- **A "normal Tuesday" proof**: one concrete before/after or capability the
  product does today, framed as a shareable story.
- **Outreach targets**: 3–5 specific communities/people worth a warm, non-spammy
  touch, with why each fits and the opening line.

## Output
- A dated brief at `docs/cofounder/growth/YYYY-MM-DD.md`, emailed in the standup
  digest. No code changes. If an idea implies a landing/feature change, note it as
  a suggestion for `cofounder-seo` or the founder — don't build it here.
- Keep a running "what we tried / what worked" thread by referencing yesterday's
  brief so ideas compound instead of repeating.
