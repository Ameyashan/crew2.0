import Anthropic from "@anthropic-ai/sdk";
import { logAgentRun } from "@/lib/agent-runs";
import { loadVoiceSamples, type VoiceSample } from "@/lib/voice";
import {
  antiAiWritingGuide,
  lintAntiAi,
  describeViolations,
  type AntiAiViolation,
} from "@/lib/writing/anti-ai";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type Channel = "email" | "x_dm" | "linkedin";

export interface ResearchInput {
  name?: string;
  linkedin_url?: string;
  x_post_url?: string;
  free_text?: string;
  intent?: string;          // user's stated goal — strong disambiguation signal
  intent_image?: { data: string; media_type: string }; // base64 screenshot
}

export interface ResearchResult {
  name: string | null;
  role: string | null;
  company: string | null;
  links: Record<string, string>;
  context_lines: string[];                          // 3 lines
  candidates?: { name: string; role?: string; company?: string; linkedin?: string }[];
  match_confidence?: "high" | "medium" | "low";    // how sure we picked the right person
  raw: string;
}

const RESEARCH_SYSTEM = `You are a research analyst preparing a single-shot brief on ONE specific person, used to draft a cold outreach.

DISAMBIGUATION IS THE PRIMARY JOB. Common names match many people. You MUST pick the right one.

Procedure:
1. If a LinkedIn URL or X URL is provided, that is the canonical anchor — start there.
2. Otherwise, search "site:linkedin.com/in <name>" first to enumerate candidates.
3. The user's "Intent" line is the strongest disambiguation signal. If they say "PM at Wayfair", the right candidate works at (or is interviewing for) Wayfair. Match against company, city, role, or topic.
4. If multiple plausible candidates exist, pick the one that best matches the intent. Set match_confidence to "high" only when the linkedin profile or another authoritative source confirms BOTH the name AND a feature from the intent (company, role, location).
5. If NO candidate clearly matches the intent, return name as null and list up to 3 candidates so the user can disambiguate. Do NOT pad with facts about the wrong person.

Use the web_search tool. Prefer the person's own profile, posts, and recent press over second-hand sources. NEVER mix facts from different people.

Output strict JSON, no prose before or after:
{
  "name": string | null,
  "role": string | null,
  "company": string | null,
  "links": { "linkedin"?: string, "x"?: string, "website"?: string, "github"?: string },
  "context_lines": [string, string, string],
  "candidates": [{ "name": string, "role"?: string, "company"?: string, "linkedin"?: string }],
  "match_confidence": "high" | "medium" | "low"
}

Rules for context_lines:
- Exactly 3 lines, each tied to the SAME person you confirmed above.
- Each line is a concrete, specific, recent fact: something they made, said, shipped, or are working on.
- Each line must contain a specific noun: a project, company, paper, number, post topic.
- No flattery, no "thought leader," no "passionate about", no generic descriptors.
- If you cannot verify 3 specific facts about the right person, return fewer (pad with empty strings). Do NOT invent or borrow from other people with the same name.`;

export async function research(input: ResearchInput): Promise<ResearchResult> {
  const started = Date.now();
  const userPrompt = [
    input.name && `Name: ${input.name}`,
    input.linkedin_url && `LinkedIn: ${input.linkedin_url}`,
    input.x_post_url && `X post: ${input.x_post_url}`,
    input.free_text && `Context the user pasted:\n${input.free_text}`,
    input.intent && `Intent (use to disambiguate which person this is):\n${input.intent}`,
    input.intent_image &&
      `Attached: a screenshot the user provided as additional context — extract any role, company, team, or other specifics visible in it.`,
  ]
    .filter(Boolean)
    .join("\n");

  if (!userPrompt) throw new Error("research(): empty input");

  type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const userContent: Anthropic.Messages.ContentBlockParam[] = input.intent_image
    ? [
        { type: "text", text: userPrompt },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: input.intent_image.media_type as ImageMime,
            data: input.intent_image.data,
          },
        },
      ]
    : [{ type: "text", text: userPrompt }];

  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: RESEARCH_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: userContent }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "reach_out:research",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  return parseResearch(text, input);
}

function parseResearch(text: string, input: ResearchInput): ResearchResult {
  const json = extractJson(text);
  let parsed: Partial<ResearchResult> = {};
  try {
    parsed = JSON.parse(json) as Partial<ResearchResult>;
  } catch {
    parsed = {};
  }
  const lines = Array.isArray(parsed.context_lines)
    ? parsed.context_lines.slice(0, 3)
    : [];
  while (lines.length < 3) lines.push("");
  return {
    name: parsed.name ?? input.name ?? null,
    role: parsed.role ?? null,
    company: parsed.company ?? null,
    links: parsed.links ?? {},
    context_lines: lines,
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 5) : undefined,
    match_confidence: parsed.match_confidence,
    raw: text,
  };
}

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

// ---------- IDENTIFY ----------
// Lightweight enumerate-candidates pass. The user confirms one before research/draft.

export interface IdentifyInput {
  text: string;          // raw paste from the user — name, name+company, etc.
  intent?: string;       // disambiguation hint
}

export interface IdentifyCandidate {
  name: string;
  role?: string | null;
  company?: string | null;
  location?: string | null;
  linkedin?: string | null;
  why?: string | null;            // 1-line reason this matches the intent (for the UI)
}

export interface IdentifyResult {
  candidates: IdentifyCandidate[];
  raw: string;
}

const IDENTIFY_SYSTEM = `You are a name-disambiguation researcher. Given a name (and an optional intent hint), return a SHORT list of distinct people who plausibly match — so the user can pick the right one before we do deeper research.

Procedure:
1. Search "site:linkedin.com/in <name>" first. Also search the name with any company word from the intent ("<name> <company>") as a second query.
2. Cluster results by person — different titles, companies, or photos = different people.
3. Return up to 5 candidates, ordered by how well they match the intent (best first).
4. For each candidate, fill role, company, location, and the linkedin URL when you can find it. Add a 1-line "why" tying them to the intent if relevant ("Sr. Analyst at Wayfair, Boston — matches 'Wayfair' in intent"). Otherwise leave why null.
5. NEVER fabricate. If you cannot find any plausible candidate, return an empty list.

Output strict JSON only, no prose:
{
  "candidates": [
    { "name": string, "role": string|null, "company": string|null, "location": string|null, "linkedin": string|null, "why": string|null }
  ]
}`;

export async function identify(input: IdentifyInput): Promise<IdentifyResult> {
  const started = Date.now();
  const userPrompt = [
    `Name or context: ${input.text}`,
    input.intent && `Intent (use to rank candidates): ${input.intent}`,
  ]
    .filter(Boolean)
    .join("\n");

  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: IDENTIFY_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 4,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "reach_out:identify",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
    });
  }

  const json = extractJson(text);
  let parsed: { candidates?: IdentifyCandidate[] } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {};
  }
  return {
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 5) : [],
    raw: text,
  };
}

// ---------- PARSE JOB META ----------
// A deliberately tiny, fast call: read a job posting and return only the
// role / company / team. This exists so the sourcing agent ("Person Khoji")
// can start in PARALLEL with the much heavier resume tailoring instead of
// waiting for it — both branches only need these three fields off the posting,
// not the tailored resume body or ATS scores.

export interface JobMeta {
  role: string | null;
  company: string | null;
  team: string | null;
}

const PARSE_JOB_META_SYSTEM = `You read a single job posting and extract only three fields. Use the web_search tool to fetch the posting at the given URL.

Identify:
- "role": the target role/job title exactly as posted (e.g. "Senior Backend Engineer"). null if you can't read it.
- "company": the hiring company. null if you can't read it.
- "team": the team/department/org this role sits in (e.g. "Research", "Product", "Platform"). null if the posting doesn't say.

Rules:
- Do NOT summarize the posting, list skills, or tailor anything. Only these three fields.
- NEVER fabricate. If the posting can't be fetched (auth wall, 404, login required), return all three as null.

Output strict JSON only, no prose, no markdown fences:
{ "role": string|null, "company": string|null, "team": string|null }`;

export async function parseJobMeta(job_url: string): Promise<JobMeta> {
  const started = Date.now();
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 300,
      system: PARSE_JOB_META_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: `# Job URL\n${job_url}` }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "compose:parse_job_meta",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { job_url },
    });
  }

  let parsed: Partial<JobMeta> = {};
  try {
    parsed = JSON.parse(extractJson(text)) as Partial<JobMeta>;
  } catch {
    parsed = {};
  }
  return {
    role: parsed.role ?? null,
    company: parsed.company ?? null,
    team: parsed.team ?? null,
  };
}

// ---------- SOURCE HIRING MANAGERS ----------
// Job-application variant of identify(): given a role + company (+ optional team),
// source a shortlist of the people most likely to be the hiring manager or the
// right person to reach out to. Mirrors how a candidate searches LinkedIn by
// "[team] [role] [company]". Reuses the IdentifyCandidate/IdentifyResult shape.

export interface SourceHiringManagersInput {
  role?: string | null;
  company: string;
  team?: string | null;
  location?: string | null;
}

const SOURCE_HM_SYSTEM = `You are a sourcing researcher. Given a job's role, company, and (optionally) the team it sits in, return a SHORT ranked list of the real people most likely to be the HIRING MANAGER for that role — or, failing that, the most relevant person to cold-email about it. The user will pick one before we draft outreach.

Search strategy (this is how a candidate would do it by hand):
1. Primary query: "[team] [role] [company]" — e.g. "Research Product Manager Thinking Machines Lab". Also run it as "site:linkedin.com/in [team] [role] [company]".
2. The hiring manager usually MANAGES this role, so also search for the team's leader: "[company] head of [team]", "[company] [team] lead/director/VP", and "site:linkedin.com/in [company] [team] manager".
3. If no team is given, fall back to "[role] [company]" and "[company] hiring manager [role]".
4. Check the company's team/about/leadership pages when LinkedIn is thin.

Ranking:
- Rank by likelihood of being the person who hires/manages this role (team leads, EMs, directors, founders at small companies) first, then close-adjacent senior people on the same team.
- Prefer people whose current company clearly matches the company named below.

Rules:
- NEVER fabricate. Only return people you actually found evidence for. If you find nobody plausible, return an empty list.
- Fill role, company, location, and the linkedin URL whenever you can find them.
- "why" is one short line tying them to this role/team ("Head of Research at Thinking Machines — likely manager for this PM role"). Keep it factual.

Output strict JSON only, no prose:
{
  "candidates": [
    { "name": string, "role": string|null, "company": string|null, "location": string|null, "linkedin": string|null, "why": string|null }
  ]
}`;

export async function sourceHiringManagers(
  input: SourceHiringManagersInput
): Promise<IdentifyResult> {
  const started = Date.now();
  const teamRolePhrase = [input.team, input.role].filter(Boolean).join(" ");
  const userPrompt = [
    `Company: ${input.company}`,
    input.role && `Role: ${input.role}`,
    input.team
      ? `Team / org: ${input.team}`
      : `Team / org: (not stated in the posting — fall back to "[role] [company]")`,
    input.location && `Location: ${input.location}`,
    `Primary search to run first: "${[teamRolePhrase, input.company].filter(Boolean).join(" ")}"`,
  ]
    .filter(Boolean)
    .join("\n");

  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1400,
      system: SOURCE_HM_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: "reach_out:source_hm",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { company: input.company, role: input.role, team: input.team },
    });
  }

  const json = extractJson(text);
  let parsed: { candidates?: IdentifyCandidate[] } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {};
  }
  return {
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 5) : [],
    raw: text,
  };
}

// ---------- DRAFT ----------

export interface DraftInput {
  person_context: ResearchResult;
  channel: Channel;
  intent?: string;
  voice_samples?: VoiceSample[];
  parent_draft?: { channel: Channel; body: string }; // for followups
  sender_context?: string;                            // about the user — name, resume excerpt
  sender_writing_samples?: string;                    // pasted samples from onboarding
  sender_full_name?: string;                          // for sign-off
  // Job-application flow: the role/company this outreach is actually about.
  // Anchors the subject + body on this so a stray Intent can't redirect the
  // email to a different company.
  job_context?: { role?: string | null; company?: string | null };
}

export interface DraftResult {
  subject: string | null;
  body: string;
  model: string;
}

const LENGTH_BUDGETS: Record<Channel, string> = {
  email: "80–120 words. Subject line under 6 words, lowercase, specific.",
  x_dm: "40–60 words. No subject. No greeting. Get to the point in sentence one.",
  linkedin: "60–100 words. No subject. One short greeting line maximum.",
};

function draftSystem(channel: Channel, signOffName?: string) {
  const subjectRules =
    channel === "email"
      ? `

SUBJECT LINE (cold email — the subject decides whether it gets opened):
- 3–6 words, specific and concrete. Sentence case or lowercase. No ALL CAPS, no emoji, no trailing punctuation.
- Anchor it to the real reason for writing: the specific role being applied to, or the single concrete thing you reference in the body. When this is a job application, name the role (and company if it fits).
- Never fake a thread: do NOT begin with "Re:", "Re ", "Fwd:", or "Following up".
- No spam/clickbait words: "opportunity", "quick question", "urgent", "free", "amazing", "exciting".
- The subject must be about the company/role this email is actually for — never a different company.`
      : "";
  return `You write outreach messages in the user's voice. The user is a thoughtful operator who hates AI-sounding email.

Channel: ${channel}.
Length: ${LENGTH_BUDGETS[channel]}

${antiAiWritingGuide("prose")}

Outreach specifics:
- Reference exactly ONE specific thing the recipient did, said, or shipped (from the research). Name the thing.
- If the research has no specific facts, tie the user's own background or intent to the recipient's company/role rather than fabricating a reference. Honest > fluffy.
- One concrete ask. A single question, not several.
- No adjectives that flatter the recipient.
- Closers: match the user's voice samples. ${signOffName ? `Default sign-off: "${signOffName.split(/\s+/)[0]}" on a new line.` : "If no samples, sign off with first name only on a new line."} Do not use "Best,", "Regards,", or "Cheers,".
- Do NOT respond with meta-commentary like "I need more context" — write the best message you can with what you have.
${subjectRules}

Output strict JSON only:
${
  channel === "email"
    ? '{ "subject": string, "body": string }'
    : '{ "body": string }'
}`;
}

// Post-generation enforcement: when the deterministic linter catches AI tells
// the model let slip, do ONE rewrite pass that fixes exactly those tells while
// preserving meaning, facts, voice, and length. Best-effort — on any failure we
// keep the original draft.
async function humanizeDraft(opts: {
  channel: Channel;
  subject: string | null;
  body: string;
  violations: AntiAiViolation[];
  signOffName?: string;
}): Promise<{ subject: string | null; body: string }> {
  const started = Date.now();
  const system = `You are an editor. Rewrite the message below to remove AI-sounding tells while keeping its meaning, every fact, the sender's voice, and roughly the same length (never longer). Do not add new claims. Preserve proper nouns and names exactly, even if a name happens to contain a flagged word.

${antiAiWritingGuide("prose")}

Output strict JSON only:
${opts.channel === "email" ? '{ "subject": string, "body": string }' : '{ "body": string }'}`;

  const userPrompt = [
    `# Tells to fix (each MUST be gone in your rewrite)`,
    describeViolations(opts.violations),
    opts.channel === "email" && opts.subject ? `\n# Current subject\n${opts.subject}` : "",
    `\n# Current body\n${opts.body}`,
    opts.signOffName ? `\n# Sign-off name\n${opts.signOffName.split(/\s+/)[0]}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: `reach_out:humanize:${opts.channel}`,
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { tells: opts.violations.map((v) => v.match) },
    });
  }

  let parsed: { subject?: string; body?: string } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    parsed = { body: text.trim() };
  }
  const body = (parsed.body ?? "").trim();
  // If the rewrite came back empty, keep the original rather than ship nothing.
  if (!body) return { subject: opts.subject, body: opts.body };
  return {
    subject: opts.channel === "email" ? parsed.subject ?? opts.subject : opts.subject,
    body,
  };
}

export async function draft(input: DraftInput): Promise<DraftResult> {
  const started = Date.now();
  const samples = input.voice_samples ?? (await loadVoiceSamples());
  const channelSamples = samples.filter(
    (s) => !s.channel || s.channel === input.channel
  );

  const userBlocks: string[] = [];
  userBlocks.push(`# Recipient`);
  const ctx = input.person_context;
  userBlocks.push(
    [
      ctx.name && `Name: ${ctx.name}`,
      ctx.role && `Role: ${ctx.role}`,
      ctx.company && `Company: ${ctx.company}`,
      Object.keys(ctx.links).length &&
        `Links: ${Object.entries(ctx.links)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  userBlocks.push(
    `Research:\n${ctx.context_lines.filter(Boolean).map((l) => `- ${l}`).join("\n") || "(no specific facts found)"}`
  );

  if (input.job_context && (input.job_context.role || input.job_context.company)) {
    const jc = [
      input.job_context.role && `Role: ${input.job_context.role}`,
      input.job_context.company && `Company: ${input.job_context.company}`,
    ]
      .filter(Boolean)
      .join("\n");
    userBlocks.push(
      `# This outreach is a job application — anchor the subject AND body on THIS role/company\n${jc}\n\nIf the Intent below names a different company, treat that as background about the sender (where they've been / what they want), NOT the target. Do not write as if applying to a different company than the one above.`
    );
  }

  if (input.intent) userBlocks.push(`# Intent\n${input.intent}`);

  if (input.sender_context) {
    userBlocks.push(`# About the sender (you are writing as this person)\n${input.sender_context}`);
  }

  if (input.sender_writing_samples) {
    userBlocks.push(
      `# Sender's writing samples (match rhythm, openers, sign-off)\n${input.sender_writing_samples}`
    );
  } else if (channelSamples.length) {
    userBlocks.push(
      `# Voice samples (match this rhythm and word choice)\n${channelSamples
        .slice(0, 5)
        .map((s, i) => `Sample ${i + 1}:\n${s.body}`)
        .join("\n\n")}`
    );
  }

  if (input.parent_draft) {
    userBlocks.push(
      `# Original message (this is a followup, ~5 days later, no reply)\n${input.parent_draft.body}\n\nWrite a short followup. Reference the original briefly. Different angle if possible. Do not say "just bumping" or "circling back".`
    );
  }

  const userPrompt = userBlocks.join("\n\n");

  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 600,
      system: draftSystem(input.channel, input.sender_full_name),
      messages: [{ role: "user", content: userPrompt }],
    });
    inTokens = resp.usage.input_tokens;
    outTokens = resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
  } catch (e) {
    outcome = "error";
    err = String(e);
    throw e;
  } finally {
    await logAgentRun({
      agent_type: `reach_out:draft:${input.channel}`,
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { intent: input.intent },
    });
  }

  const json = extractJson(text);
  let parsed: { subject?: string; body?: string } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = { body: text.trim() };
  }
  let subject = parsed.subject ?? null;
  let body = (parsed.body ?? "").trim();

  // Enforce the anti-AI writing skill: lint the output and, if any tells slipped
  // through the prompt rules, do one rewrite pass to scrub them.
  const violations = lintAntiAi([subject, body].filter(Boolean).join("\n"));
  if (violations.length) {
    try {
      const fixed = await humanizeDraft({
        channel: input.channel,
        subject,
        body,
        violations,
        signOffName: input.sender_full_name,
      });
      // Keep the rewrite only if it's actually cleaner — a single pass must
      // never make the draft worse.
      const before = violations.length;
      const after = lintAntiAi([fixed.subject, fixed.body].filter(Boolean).join("\n")).length;
      if (after < before) {
        subject = fixed.subject;
        body = fixed.body;
      }
    } catch (e) {
      console.error("[draft] humanize rewrite failed", e);
    }
  }

  return { subject, body, model: MODEL };
}
