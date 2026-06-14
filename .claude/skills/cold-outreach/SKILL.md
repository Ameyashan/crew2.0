---
name: cold-outreach
description: Write or review cold outreach — cold email, LinkedIn DM, or X (Twitter) DM — that earns a reply from a stranger. Use when drafting or editing a cold message, or when asked to make outreach less generic, shorter, or less AI-sounding.
---

# Cold outreach

Write a cold message to someone who doesn't know the sender. It has to earn a
reply in a few seconds of a stranger's attention. Treat each rule as a hard
constraint, not a preference.

## The principles

1. **Earn the open (email only).** The subject is 3–6 concrete words about the
   real reason for writing — the specific role, or the one thing you reference in
   the body. No clickbait, no fake `Re:`/`Fwd:`, no urgency words. DMs have no
   subject; lead with the hook instead.
2. **Open on them, not you.** The first line is about the recipient — something
   specific they shipped, wrote, or are working on. Never open with "My name
   is" or "I'm reaching out". Earn the next line before you talk about yourself.
3. **One reason, one ask.** Say why you're writing in a sentence, then make
   exactly ONE low-friction ask — a single yes/no-able question. Multiple asks
   split attention and kill replies.
4. **Be ruthlessly short.** Every sentence has to earn its place. A busy stranger
   should grasp the ask in one read on a phone. Rough budgets: email 80–120
   words, LinkedIn DM 60–100, X DM 40–60 (get to the point in line one).
5. **Earn credibility in one line.** Give the single most relevant proof point
   that makes you worth a reply — a concrete result, a shipped thing, a number.
   One line, not a résumé. Specific beats impressive.
6. **Make the reply effortless.** The ask should be answerable in one line
   without leaving the app. No calendar links, attachments, or "hop on a 30-min
   call" in a first touch. Lower the cost of saying yes.
7. **Respect their time and their out.** No flattery, no false urgency, no guilt,
   no manipulation. Write as a peer, not a supplicant. It should be easy to
   ignore without feeling bad — that's what makes it easy to answer.

## Channel notes

- **Email:** include a subject (rule 1). One short greeting line, sign off with
  the first name only.
- **LinkedIn DM:** no subject, at most one short greeting line. Slightly warmer
  than X.
- **X / Twitter DM:** no subject, no greeting. The first sentence is the hook.

## Also avoid AI tells

Cold outreach dies on AI-sounding phrasing. Apply the anti-AI writing rules too:
vary sentence length; name one concrete specific thing; plain words; no em-dashes
as connectors; no "I hope this finds you well", "I came across your work",
puffery, or stacked transitions ("moreover", "furthermore"). See
`src/lib/writing/anti-ai.ts`.

## The bar

Would a smart, busy person who has never heard of the sender reply to this? If
the message is generic, all about the sender, asks for too much, or could have
been sent to a hundred people, rewrite it until it couldn't have been.

## Where this lives in the app

The running agent enforces this same skill at draft time — `coldOutreachGuide()`
in `src/lib/writing/cold-outreach.ts` is injected into the draft and redraft
prompts in `src/lib/claude.ts` for every channel. Keep this file and that module
in sync when either changes.
