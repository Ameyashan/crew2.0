// ─────────────────────────── the anti-AI writing skill ───────────────────────────
//
// One canonical place for "don't sound like a language model." Every drafting
// surface — cold email + subject, X / LinkedIn DMs, resume bullets, summaries,
// headlines — imports from here so the rules can't drift apart again.
//
// The guidance below is curated from the recurring "AI tells" people actually
// flag in 2025/2026. The primary reference is Wikipedia's "Signs of AI writing"
// (WikiProject AI Cleanup) — the most thorough catalog of language-model tells:
// puffery/editorializing, "it is important to note" hedging, stacked transitions
// (moreover / furthermore), negative parallelism, the rule of three, em-dash and
// title-case overuse, participle add-ons, vague attributions, and section
// summaries. See https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing.
// Cross-referenced with the tropes.fyi catalog (tricolon abuse, "serves as"
// hedging), the ChatGPT over-used vocabulary lists (delve / leverage / robust /
// tapestry …), and cold-email humanization advice (vary sentence length, one
// concrete reference, one ask, no corporate jargon).
//
// Two layers live here:
//   1. ANTI_AI_WRITING_GUIDE  — prose injected into system prompts (generation).
//   2. lintAntiAi()           — a deterministic check on the output (enforcement).
// The prompt lists more "avoid" vocabulary than the linter flags: the prompt is
// free, but every lint hit can trigger a rewrite, so the linter stays tight and
// high-confidence to avoid burning calls on false positives.

// Multi-word clichés — opener/closer fluff and stock idioms. Substring,
// case-insensitive. High confidence: a human writing a tight cold email or
// resume bullet does not reach for these.
export const FORBIDDEN_PHRASES: string[] = [
  // cold-outreach openers/closers
  "hope this finds you well",
  "hope this email finds you",
  "i hope you are doing well",
  "i hope this message finds you",
  "i came across your work",
  "i came across your profile",
  "i'd love to learn more",
  "i would love to learn more",
  "i wanted to reach out",
  "i am reaching out",
  "i'm reaching out",
  "your fascinating work",
  "your incredible work",
  "looking forward to hearing back",
  "looking forward to your response",
  "looking forward to connecting",
  "thank you for your time and consideration",
  // AI filler transitions / framing
  "it's worth noting",
  "it is worth noting",
  "it's important to note",
  "it is important to note",
  "important to note that",
  "it is important to remember",
  "it bears mentioning",
  "needless to say",
  "at the end of the day",
  "here's the thing",
  "here's the kicker",
  "here's where it gets interesting",
  "let's dive in",
  "let's unpack",
  "let's break it down",
  "in today's fast-paced world",
  "in today's digital age",
  "in conclusion",
  "to sum up",
  "a testament to",
  "plays a crucial role",
  "plays a vital role",
  "plays a key role",
  // encyclopedic puffery / editorializing (Wikipedia "Signs of AI writing")
  "rich tapestry",
  "rich cultural heritage",
  "rich history",
  "stands as a testament",
  "serves as a testament",
  "left an indelible mark",
  "leaving a lasting impact",
  "leaves a lasting impact",
  "watershed moment",
  "deeply rooted in",
  // vague hand-waving attributions
  "industry experts",
  "studies have shown",
  "it is widely regarded",
  // stock metaphors / idioms
  "game changer",
  "game-changer",
  "move the needle",
  "double-edged sword",
  "tip of the iceberg",
  "perfect storm",
  // resume-speak
  "results-driven",
  "results-oriented",
  "detail-oriented",
  "team player",
  "go-getter",
  "proven track record",
  "think outside the box",
];

// Single-word tells. Matched on whole-word boundaries, case-insensitive. Kept
// to the strongest offenders so the linter rarely fires on genuine human prose.
export const FORBIDDEN_WORDS: string[] = [
  "delve",
  "leverage",
  "leveraging",
  "utilize",
  "utilizing",
  "harness",
  "harnessing",
  "streamline",
  "underscore",
  "underscores",
  "robust",
  "seamless",
  "seamlessly",
  "pivotal",
  "tapestry",
  "realm",
  "testament",
  "foster",
  "paradigm",
  "synergy",
  "synergies",
  "transformative",
  "spearhead",
  "spearheaded",
  "passionate",
  "passionately",
  // stacked AI transitions (Wikipedia "Signs of AI writing")
  "moreover",
  "furthermore",
];

// Present participles that AI tacks onto a sentence to fake analysis
// ("…, highlighting its importance"). Flagged only when comma-led at clause end.
const PARTICIPLE_TELLS = [
  "highlighting",
  "reflecting",
  "underscoring",
  "showcasing",
  "demonstrating",
  "emphasizing",
  "signaling",
  "cementing",
  "solidifying",
  "contributing to",
  "paving the way",
  "ushering in",
];

// "-ing" words that legitimately open a trailing clause: they introduce a list or
// a method rather than padding the sentence with a restated outcome.
const PARTICIPLE_SAFE = new Set([
  "including",
  "excluding",
  "spanning",
  "covering",
  "ranging",
  "comprising",
  "using",
  "regarding",
  "following",
  "totalling",
  "totaling",
  "averaging",
  "reaching",
  "growing",
  "serving",
]);


export type AntiAiViolationKind =
  | "phrase"
  | "word"
  | "em-dash"
  | "negative-parallelism"
  | "participle-ending"
  | "arrow";

export interface AntiAiViolation {
  kind: AntiAiViolationKind;
  match: string; // the offending snippet, verbatim
  hint: string; // how to fix it
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Deterministic scan for the highest-confidence AI tells. Returns one entry per
// distinct offender (deduped by kind+match). Empty array = clean.
export function lintAntiAi(text: string): AntiAiViolation[] {
  const out: AntiAiViolation[] = [];
  const seen = new Set<string>();
  const push = (v: AntiAiViolation) => {
    const key = `${v.kind}:${v.match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  if (!text) return out;
  const lower = text.toLowerCase();

  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      push({ kind: "phrase", match: phrase, hint: "cliché filler — cut it or say the plain thing" });
    }
  }

  for (const word of FORBIDDEN_WORDS) {
    // Case-sensitive, lowercase-only on purpose: the tell is a lowercase word
    // mid-sentence ("we foster collaboration"). Skipping capitalized hits avoids
    // mangling proper nouns or sentence starts ("Foster" the surname, "Robust AI").
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`);
    const m = text.match(re);
    if (m) push({ kind: "word", match: m[0], hint: "AI-overused word — use a plain everyday verb/noun" });
  }

  // Em-dash used anywhere (the single most-flagged formatting tell). Use periods
  // or commas instead.
  if (text.includes("—")) {
    push({ kind: "em-dash", match: "—", hint: "drop the em-dash; use a period or comma" });
  }

  // → and other arrow decoration that a keyboard doesn't naturally produce.
  if (/[→⇒]/.test(text)) {
    push({ kind: "arrow", match: "→", hint: "remove arrow/unicode decoration; write it out" });
  }

  // Negative parallelism: "not just X, but Y" / "it's not X, it's Y".
  const negParallel = [
    /\bnot just\b[^.?!\n]{1,60}?\bbut\b/i,
    /\bit'?s not\b[^.?!\n]{1,60}?\bit'?s\b/i,
    /\bisn'?t (?:about|just)\b[^.?!\n]{1,60}?\bit'?s\b/i,
  ];
  for (const re of negParallel) {
    const m = text.match(re);
    if (m) {
      push({ kind: "negative-parallelism", match: m[0].trim(), hint: "drop the 'not X, but Y' reframe; state Y directly" });
      break;
    }
  }

  // Participle phrase tacked onto the end of a clause to inject shallow meaning.
  const participleRe = new RegExp(`,\\s+(${PARTICIPLE_TELLS.map(escapeRegExp).join("|")})\\b`, "i");
  const pm = text.match(participleRe);
  if (pm) {
    push({ kind: "participle-ending", match: pm[0].trim(), hint: "cut the '…, -ing' add-on; end the sentence on the fact" });
  }

  // The same tell in its commonest disguise: a trailing "-ing" clause that carries
  // no figure. The wordlist above only catches the abstract ones ("…, underscoring
  // our commitment"); in practice the padding sounds concrete and is just as empty
  // ("…, enabling real-time decision-making"). The discriminator is a number: a
  // tail that states a result earns its place, a tail that restates the sentence
  // does not.
  //
  // A comma-participle anywhere confirms we are in a tail; the clause that matters
  // is the LAST one, because a long tail often banks its number early and then
  // pads ("…, improving speed by 20% … and enabling real-time decision-making").
  if (/,\s+[a-z]+ing\b/i.test(text)) {
    let last: { word: string; rest: string } | null = null;
    const clauseRe = /(?:,|\band)\s+([a-z]+ing)\b/gi;
    let cm: RegExpExecArray | null;
    while ((cm = clauseRe.exec(text))) {
      last = { word: cm[1], rest: text.slice(cm.index + cm[0].length) };
    }
    if (last && !PARTICIPLE_SAFE.has(last.word.toLowerCase()) && !/\d/.test(last.rest)) {
      push({
        kind: "participle-ending",
        match: `, ${last.word}…`,
        hint: "the trailing '-ing' clause adds no fact; end on the result, or give the clause a number",
      });
    }
  }

  return out;
}

// Deterministic backstop for the em-dash rule above, for copy that must not carry
// one at all (résumé bullets). It is a last resort, not a substitute for writing
// the sentence properly: the generator is told to restructure rather than reach
// for a dash, and lintAntiAi flags any that survive. This catches the stragglers.
// A dash between numbers is a range and becomes an en dash; anywhere else it
// becomes a comma.
export function stripEmDashes(text: string): string {
  return text
    .replace(/(\d)\s*—\s*(\d)/g, "$1 – $2")
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");
}

// Render violations as a compact instruction block for a rewrite prompt.
export function describeViolations(violations: AntiAiViolation[]): string {
  if (!violations.length) return "";
  return violations
    .map((v) => `- ${v.kind}: "${v.match}" — ${v.hint}`)
    .join("\n");
}

// The skill itself: a format-agnostic guidance block injected into every
// drafting system prompt. `audience` lets callers tune the closing line for
// prose (messages) vs. fragments (resume bullets, headlines, subjects).
export function antiAiWritingGuide(audience: "prose" | "fragments" = "prose"): string {
  return `WRITING VOICE — write like a sharp human, never like a language model. Treat every rule below as a hard constraint, not a preference.

Avoid these AI tells:
- Overused AI vocabulary: ${FORBIDDEN_WORDS.slice(0, 16).join(", ")}, and similar inflated words. Use plain, everyday words instead.
- Cliché phrases and filler transitions: ${FORBIDDEN_PHRASES.slice(0, 12).map((p) => `"${p}"`).join(", ")}, and the like. Cut them.
- Em-dashes (—) used as connectors, and any arrows/unicode decoration. Use periods and commas.
- Negative parallelism: "it's not X, it's Y" / "not just X, but Y". State the point directly.
- The rule of three / tricolons used for rhythm ("fast, simple, and reliable"). One concrete item beats three vague ones.
- Participle add-ons that fake analysis ("…, highlighting its importance", "…, reflecting a broader trend"). End on the fact.
- Rhetorical self-questions ("The result? A faster pipeline.") and signposted conclusions ("In conclusion", "To sum up").
- Hedging verbs like "serves as", "stands as" — just use "is".
- Puffery and editorializing ("rich tapestry", "stands as a testament", "left an indelible mark", "watershed moment"). State the plain fact, not its significance.
- "It is important to note" and stacked transitions ("Moreover", "Furthermore", "Additionally") — delete them and let the sentences stand on their own.
- Vague attributions ("industry experts say", "studies have shown", "it is widely regarded"). Name the specific source or cut the claim.

Do this instead:
- Vary sentence length. Mix short, punchy lines with longer ones. Uniform sentence length is the loudest AI tell.
- Be concrete and specific. Name the real thing — a number, a project, a person, a fact — rather than gesturing at it.
- Plain words. No corporate jargon, no metaphors that did not exist 200 years ago.${
    audience === "prose"
      ? "\n- Sound like one person typed it quickly and meant it. Confident, direct, a little plain."
      : "\n- These are fragments, not prose: lead with a strong action verb and a concrete result. No filler, no flourish."
  }`;
}

// Backwards-friendly constant for callers that want the default (prose) guide.
export const ANTI_AI_WRITING_GUIDE = antiAiWritingGuide("prose");
