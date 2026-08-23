// ───────────────────────── inline **bold** markup ─────────────────────────
//
// Resume copy carries a single piece of inline formatting: `**bold**` spans that
// the model chooses (the metric, the scope, the outcome of a bullet). The source
// resume a user uploads is flattened to plain text on ingest, so the emphasis is
// never copied — it's decided fresh each time the resume is tailored.
//
// Three renderers consume the same markup — the PDF (@react-pdf nested <Text>),
// the DOCX (multiple TextRuns), and the on-screen preview (<strong>) — so the
// tokenizer lives here rather than in any one of them. Everything that needs
// plain text (the anti-AI linter, the changelog, filenames, progress counters)
// goes through `stripInlineBold` instead.

export type InlineSpan = { text: string; bold: boolean };

// `**` … `**`, non-greedy, never spanning a line break. An unmatched trailing
// `**` is left alone by the match and cleaned up by the caller.
const BOLD_RE = /\*\*([^*\n](?:[^*\n]|\*(?!\*))*)\*\*/g;

// Split a string into alternating plain/bold spans. Always returns at least one
// span for a non-empty input, and never returns empty spans.
export function parseInlineBold(input: string): InlineSpan[] {
  const s = input ?? "";
  if (!s) return [];
  if (!s.includes("**")) return [{ text: s, bold: false }];

  const spans: InlineSpan[] = [];
  let last = 0;
  BOLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD_RE.exec(s))) {
    if (m.index > last) spans.push({ text: s.slice(last, m.index), bold: false });
    spans.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) spans.push({ text: s.slice(last), bold: false });

  // A stray `**` that never closed would otherwise print literally.
  return spans
    .map((sp) => (sp.bold ? sp : { ...sp, text: sp.text.replace(/\*\*/g, "") }))
    .filter((sp) => sp.text.length > 0);
}

// The same string with all markup removed. Use wherever plain text is required.
export function stripInlineBold(input: string): string {
  return parseInlineBold(input)
    .map((s) => s.text)
    .join("");
}

// Normalize model output before it's stored: drop empty or whitespace-only bold
// spans, keep at most `maxSpans` of them (the prompt asks for 1–2; this is the
// backstop against a bullet that bolds every clause), and strip leftover
// asterisks. Returns plain text when the input has no usable emphasis.
export function sanitizeInlineBold(input: string, maxSpans = 2): string {
  const spans = parseInlineBold(input ?? "");
  if (!spans.length) return "";

  let kept = 0;
  const out = spans.map((s) => {
    if (!s.bold) return s.text;
    // A bold span that is only punctuation/whitespace adds noise, not emphasis.
    if (!/\w/.test(s.text) || kept >= maxSpans) return s.text;
    kept++;
    return `**${s.text}**`;
  });

  // Bolding the entire fragment is the same as bolding none of it, and it wrecks
  // the visual rhythm of the bullet list.
  const joined = out.join("");
  if (kept === 1 && spans.length === 1 && spans[0].bold) return spans[0].text;
  return joined;
}
