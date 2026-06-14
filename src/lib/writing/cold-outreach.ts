// ─────────────────────────── the cold-outreach skill ───────────────────────────
//
// Companion to the anti-AI writing skill. That one governs HOW a line reads (no
// language-model tells); this one governs WHAT a cold message has to do to earn a
// reply from a stranger. Both are injected into every outreach drafting + redraft
// system prompt — cold email AND cold LinkedIn / X DMs — so the agent applies
// them on every run.
//
// Curated from the durable, source-agnostic fundamentals of cold outreach that
// every credible guide agrees on (Amplemarket / Lemlist / HBR / "Smart Brevity"
// and the like): make it relevant, make it short, make ONE easy ask, and make it
// effortless to ignore. The guide is channel-aware — the subject-line rule only
// applies to email; exact length budgets live with the draft prompts.

export type OutreachChannel = "email" | "x_dm" | "linkedin";

interface OutreachPrinciple {
  title: string;
  detail: string;
  // When set, the principle only applies to these channels (e.g. a subject line
  // exists only in email). Omitted → applies everywhere.
  channels?: OutreachChannel[];
}

// The principles, kept as data so they can be reused (docs, the .claude skill, a
// future linter) and the prose stays in sync with the list.
export const OUTREACH_PRINCIPLES: OutreachPrinciple[] = [
  {
    title: "Earn the open",
    detail:
      "The subject is 3–6 concrete words about the real reason for writing — the specific role, or the one thing you reference in the body. No clickbait, no fake Re:/Fwd:, no urgency words.",
    channels: ["email"], // email has a subject line; DMs don't
  },
  {
    title: "Open on them, not you",
    detail:
      "The first line is about the recipient — something specific they shipped, wrote, or are working on. Never open with 'My name is' or 'I'm reaching out'. Earn the next line before you talk about yourself.",
  },
  {
    title: "One reason, one ask",
    detail:
      "Say why you're writing in a sentence, then make exactly ONE low-friction ask — a single yes/no-able question. Multiple asks split attention and kill replies.",
  },
  {
    title: "Be ruthlessly short",
    detail:
      "Every sentence has to earn its place. A busy stranger should grasp the ask in one read on a phone. In a DM that means a couple of sentences — get to the point in line one.",
  },
  {
    title: "Earn credibility in one line",
    detail:
      "Give the single most relevant proof point that makes you worth a reply — a concrete result, a shipped thing, a number. One line, not a résumé. Specific beats impressive.",
  },
  {
    title: "Make the reply effortless",
    detail:
      "The ask should be answerable in one line without leaving the app. No calendar links, attachments, or 'hop on a 30-min call' in a first touch. Lower the cost of saying yes.",
  },
  {
    title: "Respect their time and their out",
    detail:
      "No flattery, no false urgency, no guilt, no manipulation. Write as a peer, not a supplicant. It should be easy to ignore without feeling bad — that's what makes it easy to answer.",
  },
];

const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  email: "cold email",
  x_dm: "cold X (Twitter) DM",
  linkedin: "cold LinkedIn DM",
};

// The skill itself: a guidance block injected into the outreach drafting system
// prompt (alongside the anti-AI writing guide), tailored to the channel.
export function coldOutreachGuide(channel: OutreachChannel = "email"): string {
  const label = CHANNEL_LABEL[channel];
  const principles = OUTREACH_PRINCIPLES.filter(
    (p) => !p.channels || p.channels.includes(channel),
  );
  const body = principles
    .map((p, i) => `${i + 1}. ${p.title}: ${p.detail}`)
    .join("\n");
  return `COLD OUTREACH CRAFT — this is a ${label} to someone who doesn't know the sender. It has to earn a reply in a few seconds of a stranger's attention. Treat each rule as a hard constraint:

${body}

The bar: would a smart, busy person who has never heard of the sender reply to this? If the message is generic, all about the sender, asks for too much, or could have been sent to a hundred people, rewrite it until it couldn't have been.`;
}
