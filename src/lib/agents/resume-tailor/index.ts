import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { fetchAtsPosting } from "@/lib/job-fetch";
import { logAgentRun } from "@/lib/agent-runs";
import { getProfile } from "@/lib/profile";
import { lintAntiAi, describeViolations, antiAiWritingGuide } from "@/lib/writing/anti-ai";
import { sanitizeInlineBold, stripInlineBold } from "@/lib/writing/inline-markup";
import { SYSTEM_PROMPT, SKILL_SYSTEM_SUFFIX, buildUserPrompt } from "./prompt";
import { fitResumeToPageCount } from "./fit";
import type {
  ResumeChange,
  ResumeChangeKind,
  ResumeTailorInput,
  ResumeTailorStepEvent,
  TailoredResume,
} from "./types";

const MODEL = "claude-sonnet-4-6";

// Custom resume-writer Agent Skill, uploaded via the Skills API (see
// scripts/upload-resume-skill.mjs). When set, the darzi runs inside a
// code-execution container with this skill loaded; when unset, it falls back to
// the plain web_search tailoring path so the feature degrades cleanly.
const SKILL_ID = process.env.RESUME_SKILL_ID?.trim() || null;

// Beta features required to load an Agent Skill in the code-execution container.
const SKILL_BETAS: Anthropic.Beta.AnthropicBeta[] = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
];

// The skill executes inside a server-side code-execution loop that can pause
// (stop_reason "pause_turn") before emitting the final JSON. Bound how many
// times we hand the turn back to let it resume.
const MAX_TURNS = 6;

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export async function* runResumeTailorStream(
  input: ResumeTailorInput
): AsyncGenerator<ResumeTailorStepEvent> {
  try {
    const profile = await getProfile();
    if (!profile?.resume_text) {
      yield {
        type: "error",
        message: "No resume on file. Upload one in onboarding or on /resume first.",
      };
      return;
    }

    yield { type: "step", id: "research", status: "start" };

    // Known ATS board (Greenhouse/Lever)? Read the exact posting from its public
    // API and feed it straight into the prompt, so the tailor reads the right
    // job instead of web_searching the URL and risking the wrong opening. Any
    // failure leaves posting null and the model falls back to web_search.
    let posting = input.job_posting ?? null;
    if (!posting && input.job_url) {
      const fetched = await fetchAtsPosting(input.job_url).catch(() => null);
      if (fetched) {
        posting = {
          title: fetched.title,
          company: fetched.company,
          team: fetched.team,
          text: fetched.text,
        };
      }
    }

    const userPrompt = buildUserPrompt({
      ...input,
      job_posting: posting,
      resume_text: profile.resume_text,
      full_name: profile.full_name,
    });

    const started = Date.now();
    let text = "";
    let inTokens = 0;
    let outTokens = 0;
    let outcome: "ok" | "error" = "ok";
    let err: string | null = null;
    // Files the skill writes into the code-execution container (e.g. a formatted
    // .docx/.pdf). Surfaced to the user as downloads alongside the JSON render.
    const artifacts: { file_id: string }[] = [];

    // web_search reads the job posting; when a resume-writer skill is configured
    // we also enable the code-execution tool the skill runs inside.
    const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      } as unknown as Anthropic.Beta.Messages.BetaToolUnion,
    ];
    if (SKILL_ID) {
      tools.push({
        type: "code_execution_20250825",
        name: "code_execution",
      } as unknown as Anthropic.Beta.Messages.BetaToolUnion);
    }
    const system = SKILL_ID ? SYSTEM_PROMPT + SKILL_SYSTEM_SUFFIX : SYSTEM_PROMPT;

    try {
      const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
        { role: "user", content: userPrompt },
      ];
      let skillSignaled = false;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = client().beta.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          system,
          ...(SKILL_ID
            ? {
                betas: SKILL_BETAS,
                container: {
                  skills: [
                    { type: "custom", skill_id: SKILL_ID, version: "latest" },
                  ],
                },
              }
            : {}),
          tools,
          messages,
        });

        const toolBlocks = new Map<number, { name: string; partial: string }>();
        let turnText = "";
        let lastProgressAt = 0;
        let lastProgressChars = 0;

        for await (const evt of stream) {
          if (evt.type === "content_block_start") {
            const block = evt.content_block as { type: string; name?: string };
            if (block.type === "server_tool_use" || block.type === "tool_use") {
              if (block.name === "web_search") {
                toolBlocks.set(evt.index, { name: block.name, partial: "" });
              } else if (
                (block.name === "code_execution" ||
                  block.name === "bash_code_execution") &&
                !skillSignaled
              ) {
                // One progress ping the first time the skill actually runs.
                skillSignaled = true;
                yield { type: "tool", name: "skill" };
              }
            }
          } else if (evt.type === "content_block_delta") {
            const delta = evt.delta as {
              type: string;
              text?: string;
              partial_json?: string;
            };
            if (delta.type === "text_delta" && delta.text) {
              turnText += delta.text;
              const now = Date.now();
              if (
                now - lastProgressAt > 250 &&
                turnText.length - lastProgressChars > 80
              ) {
                const bullets = (turnText.match(/\.\s*"/g) || []).length;
                lastProgressAt = now;
                lastProgressChars = turnText.length;
                yield { type: "progress", chars: turnText.length, bullets };
              }
            } else if (delta.type === "input_json_delta" && delta.partial_json) {
              const b = toolBlocks.get(evt.index);
              if (b) b.partial += delta.partial_json;
            }
          } else if (evt.type === "content_block_stop") {
            const b = toolBlocks.get(evt.index);
            if (b) {
              let query: string | null = null;
              try {
                const parsed = JSON.parse(b.partial) as { query?: string };
                query = parsed.query ?? null;
              } catch {
                // partial JSON didn't parse — skip
              }
              toolBlocks.delete(evt.index);
              if (query) yield { type: "tool", name: "web_search", query };
            }
          }
        }

        const final = await stream.finalMessage();
        inTokens += final.usage.input_tokens;
        outTokens += final.usage.output_tokens;
        collectArtifacts(final.content, artifacts);

        // Server paused its tool loop — hand the turn back and let it resume.
        if (final.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: final.content });
          continue;
        }

        // Done. Prefer streamed text; fall back to the SDK's reassembled blocks
        // (which include any final text block we didn't capture via deltas).
        text = turnText;
        if (!text) {
          for (const block of final.content) {
            if (block.type === "text") text += block.text;
          }
        }
        break;
      }
    } catch (e) {
      outcome = "error";
      err = String(e);
      throw e;
    } finally {
      await logAgentRun({
        agent_type: "resume:tailor",
        model: MODEL,
        input_tokens: inTokens,
        output_tokens: outTokens,
        latency_ms: Date.now() - started,
        outcome,
        error: err,
        meta: {
          page_count: input.page_count,
          has_highlights: !!input.highlights?.trim(),
          has_feedback: !!input.regenerate_notes?.trim(),
          skill_id: SKILL_ID,
          artifacts: artifacts.length,
        },
      });
    }

    const parsed = parseTailored(text, input);

    // We read the posting directly, so trust its fields over whatever the model
    // echoed back: backfill any role/company/team the model left blank.
    if (posting) {
      parsed.meta.target_role = parsed.meta.target_role || posting.title || undefined;
      parsed.meta.target_company = parsed.meta.target_company || posting.company || undefined;
      if (parsed.meta.team == null) parsed.meta.team = posting.team ?? null;
    }

    if (parsed.experience?.[0]?.bullets?.[0] === "JOB_FETCH_FAILED") {
      yield {
        type: "error",
        message:
          "Couldn't read the job posting (probably auth-walled). Paste the job description into Highlights and re-run.",
      };
      return;
    }

    // Record which skill shaped this resume, plus any files it produced, so the
    // saved generation can offer them as downloads and the live UI can link them.
    parsed.meta.skill_id = SKILL_ID;
    if (artifacts.length) {
      parsed.meta.artifacts = artifacts.map((a) => ({ file_id: a.file_id }));
      for (const a of artifacts) {
        yield { type: "artifact", file_id: a.file_id };
      }
    }

    // Enforce the anti-AI writing skill on the generated copy: lint every bullet,
    // the summary, and the headline, and rewrite only the offending fragments.
    // Best-effort — a failure here must not block the resume.
    try {
      await humanizeResume(parsed);
    } catch (e) {
      console.error("[resume-tailor] humanize failed", e);
    }

    yield {
      type: "step",
      id: "research",
      status: "done",
      data: {
        job_title: parsed.meta.target_role,
        company: parsed.meta.target_company,
      },
    };

    yield { type: "step", id: "tailor", status: "start" };

    // Fit the resume to the user's target page count against the REAL rendered
    // PDF. The model treats page_count as a soft cap and @react-pdf paginates
    // freely, so a "1 page" target can still spill onto a second page on
    // download — the exact mismatch the preview label hid. Render → measure →
    // trim the lowest-priority content until it actually fits, then stamp
    // meta.page_count with the measured count so the label, the PDF, and the
    // DOCX all agree. Best-effort: any failure leaves the resume untouched.
    try {
      const fitted = await fitResumeToPageCount(parsed, input.page_count);
      parsed.summary = fitted.resume.summary;
      parsed.experience = fitted.resume.experience;
      parsed.projects = fitted.resume.projects;
      parsed.education = fitted.resume.education;
      parsed.skills = fitted.resume.skills;
      parsed.extras = fitted.resume.extras;
      parsed.meta.page_count = fitted.resume.meta.page_count;
      // Record honestly what was trimmed to fit, so "what changed" stays truthful.
      if (fitted.dropped.length) {
        const trimNote = `trimmed to fit ${input.page_count} page${input.page_count > 1 ? "s" : ""}`;
        const trimEntries: ResumeChange[] = fitted.dropped.slice(0, 4).map((d) => ({
          section: d.section,
          kind: "dropped" as const,
          before: d.removed,
          reason: trimNote,
        }));
        parsed.changes = [...(parsed.changes ?? []), ...trimEntries];
      }
    } catch (e) {
      console.error("[resume-tailor] page-fit failed", e);
    }

    yield {
      type: "step",
      id: "tailor",
      status: "done",
      data: { resume: parsed },
    };
    yield { type: "complete" };
  } catch (e) {
    yield { type: "error", message: String(e instanceof Error ? e.message : e) };
  }
}

// Pull file IDs out of any code-execution results the skill produced, so a
// formatted resume document the skill wrote in the container can be offered as a
// download. Dedupes against what we've already collected across pause_turn loops.
function collectArtifacts(
  content: Anthropic.Beta.Messages.BetaContentBlock[],
  artifacts: { file_id: string }[]
): void {
  for (const block of content) {
    if (
      block.type !== "code_execution_tool_result" &&
      block.type !== "bash_code_execution_tool_result"
    ) {
      continue;
    }
    const inner = (block as { content?: { content?: unknown } }).content;
    const items = inner?.content;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const fid =
        it && typeof it === "object" && "file_id" in it
          ? (it as { file_id?: unknown }).file_id
          : undefined;
      if (typeof fid === "string" && !artifacts.some((a) => a.file_id === fid)) {
        artifacts.push({ file_id: fid });
      }
    }
  }
}

// Drop empties and normalize the model's **bold** markup: at most two emphasis
// spans per line, no stray asterisks, never a fully-bolded bullet.
function cleanBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => sanitizeInlineBold(b));
}

function parseTailored(text: string, input: ResumeTailorInput): TailoredResume {
  const json = extractJson(text);
  let raw: Partial<TailoredResume> & { meta?: Partial<TailoredResume["meta"]> } = {};
  try {
    raw = JSON.parse(json) as typeof raw;
  } catch {
    throw new Error("Resume tailor returned invalid JSON");
  }

  const header = raw.header ?? { full_name: "", headline: "" };
  const experience = Array.isArray(raw.experience) ? raw.experience : [];
  const education = Array.isArray(raw.education) ? raw.education : [];
  const skills = Array.isArray(raw.skills) ? raw.skills : undefined;
  const projects = Array.isArray(raw.projects) ? raw.projects : undefined;
  const extras = Array.isArray(raw.extras) ? raw.extras : undefined;
  const changes = sanitizeChanges(raw.changes);

  return {
    header: {
      full_name: header.full_name ?? "",
      headline: header.headline ?? "",
      location: header.location,
      email: header.email,
      phone: header.phone,
      links: header.links,
    },
    summary: raw.summary ? sanitizeInlineBold(raw.summary) : undefined,
    experience: experience.map((e) => ({
      company: e.company ?? "",
      role: e.role ?? "",
      location: e.location,
      start: e.start ?? "",
      end: e.end ?? "",
      bullets: cleanBullets(e.bullets),
      tracks: Array.isArray(e.tracks)
        ? e.tracks
            .map((t) => ({
              title: t?.title ?? "",
              context: t?.context ? sanitizeInlineBold(t.context) : undefined,
              bullets: cleanBullets(t?.bullets),
            }))
            // A track with neither a title nor a bullet is noise on the page.
            .filter((t) => t.title || t.bullets.length)
        : undefined,
    })),
    education: education.map((e) => ({
      school: e.school ?? "",
      degree: e.degree,
      field: e.field,
      start: e.start,
      end: e.end,
      gpa: e.gpa,
      coursework: e.coursework,
      notes: Array.isArray(e.notes) ? e.notes.filter(Boolean) : undefined,
    })),
    skills: skills?.map((s) => ({
      group: s.group ?? "",
      items: Array.isArray(s.items) ? s.items.filter(Boolean) : [],
    })),
    projects: projects?.map((p) => ({
      name: p.name ?? "",
      link: p.link,
      bullets: cleanBullets(p.bullets),
    })),
    extras: extras?.map((x) => ({
      heading: x.heading ?? "",
      items: cleanBullets(x.items),
      roles: Array.isArray(x.roles)
        ? x.roles
            .map((r) => ({
              role: r?.role ?? "",
              org: r?.org,
              location: r?.location,
              start: r?.start,
              end: r?.end,
              context: r?.context ? sanitizeInlineBold(r.context) : undefined,
              bullets: cleanBullets(r?.bullets),
            }))
            .filter((r) => r.role || r.bullets.length)
        : undefined,
    })),
    changes,
    meta: {
      target_role: raw.meta?.target_role ?? undefined,
      target_company: raw.meta?.target_company ?? undefined,
      team: raw.meta?.team ?? null,
      job_url: input.job_url,
      page_count: input.page_count,
      model: MODEL,
      generated_at: new Date().toISOString(),
      ats_score:
        typeof raw.meta?.ats_score === "number" &&
        raw.meta.ats_score >= 0 &&
        raw.meta.ats_score <= 100
          ? Math.round(raw.meta.ats_score)
          : undefined,
      ats_score_before:
        typeof raw.meta?.ats_score_before === "number" &&
        raw.meta.ats_score_before >= 0 &&
        raw.meta.ats_score_before <= 100
          ? Math.round(raw.meta.ats_score_before)
          : undefined,
    },
  };
}

const CHANGE_KINDS: ResumeChangeKind[] = [
  "rewrote",
  "added",
  "reordered",
  "emphasized",
  "dropped",
];

// Coerce the model's freeform "changes" into a clean, bounded changelog. Drops
// malformed entries, clamps the kind to a known value, trims strings, and caps
// the list so the UI never has to defend against junk. Returns undefined when
// there's nothing usable (e.g. the JD wasn't seen).
function sanitizeChanges(raw: unknown): ResumeChange[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ResumeChange[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const section = typeof r.section === "string" ? r.section.trim() : "";
    // The changelog is plain prose in the UI — never show raw ** markup there.
    const before =
      typeof r.before === "string" && r.before.trim()
        ? stripInlineBold(r.before.trim())
        : undefined;
    const after =
      typeof r.after === "string" && r.after.trim()
        ? stripInlineBold(r.after.trim())
        : undefined;
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    // An entry with no concrete content tells the user nothing — skip it.
    if (!section && !before && !after) continue;
    const kind = CHANGE_KINDS.includes(r.kind as ResumeChangeKind)
      ? (r.kind as ResumeChangeKind)
      : "rewrote";
    out.push({ section, kind, before, after, reason });
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

// Lint every piece of generated copy on the resume (bullets, summary, headline)
// and rewrite ONLY the fragments that trip the anti-AI linter, in a single call.
// Mutates `resume` in place. No-op when the copy is already clean.
async function humanizeResume(resume: TailoredResume): Promise<void> {
  // Addressable handles for every rewritable string on the resume.
  const fields: { text: string; set: (s: string) => void }[] = [];
  if (resume.summary) fields.push({ text: resume.summary, set: (s) => (resume.summary = s) });
  if (resume.header.headline) {
    fields.push({ text: resume.header.headline, set: (s) => (resume.header.headline = s) });
  }
  for (const exp of resume.experience) {
    exp.bullets.forEach((b, i) => fields.push({ text: b, set: (s) => (exp.bullets[i] = s) }));
    // Bullets under a multi-stint employer live inside tracks, not on the entry —
    // without this they'd skip the humanize pass entirely.
    for (const track of exp.tracks ?? []) {
      track.bullets.forEach((b, i) =>
        fields.push({ text: b, set: (s) => (track.bullets[i] = s) })
      );
    }
  }
  for (const proj of resume.projects ?? []) {
    proj.bullets.forEach((b, i) => fields.push({ text: b, set: (s) => (proj.bullets[i] = s) }));
  }
  for (const extra of resume.extras ?? []) {
    for (const role of extra.roles ?? []) {
      role.bullets.forEach((b, i) =>
        fields.push({ text: b, set: (s) => (role.bullets[i] = s) })
      );
    }
  }

  // Only the fragments that actually trip the linter get sent for rewrite. Lint
  // the plain text: `**` markup is formatting, not an AI tell, and feeding it to
  // the linter would only add noise.
  const dirty = fields
    .map((f, i) => ({ i, text: f.text, tells: lintAntiAi(stripInlineBold(f.text)) }))
    .filter((x) => x.tells.length > 0)
    .slice(0, 40);
  if (!dirty.length) return;

  const system = `You are a resume line editor. You will receive resume fragments (bullets, a summary, or a headline) that contain AI-sounding tells. Rewrite each to remove the tells while keeping its EXACT meaning and every fact, number, company, title, skill, and date. Never invent or inflate anything. Keep each fragment about the same length or shorter.

${antiAiWritingGuide("fragments")}

Some fragments contain **bold** spans marking their highest-signal phrase. Keep those spans in your rewrite — move them if the wording moves, but never add, drop, or nest them.

Output strict JSON only, one entry for EVERY fragment you were given, reusing the same "i":
{ "fields": [ { "i": number, "text": string } ] }`;

  const userPrompt = `# Fragments to fix\n${JSON.stringify(
    dirty.map((d) => ({ i: d.i, text: d.text, tells: d.tells.map((t) => t.match) })),
    null,
    2
  )}\n\n# Reference: the specific tells caught\n${describeViolations(dirty.flatMap((d) => d.tells))}`;

  const started = Date.now();
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  let outcome: "ok" | "error" = "ok";
  let err: string | null = null;
  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1500,
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
      agent_type: "resume:humanize",
      model: MODEL,
      input_tokens: inTokens,
      output_tokens: outTokens,
      latency_ms: Date.now() - started,
      outcome,
      error: err,
      meta: { dirty_fields: dirty.length },
    });
  }

  let parsed: { fields?: { i: number; text: string }[] } = {};
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return; // unparseable rewrite — keep the original copy
  }
  for (const f of parsed.fields ?? []) {
    const target = fields[f.i];
    const next = (f.text ?? "").trim();
    // Only accept a rewrite that is non-empty AND actually cleaner than before.
    // Both sides are compared stripped so markup can't tip the count either way,
    // and the accepted text is re-sanitized in case the editor over-bolded.
    if (
      target &&
      next &&
      lintAntiAi(stripInlineBold(next)).length <
        lintAntiAi(stripInlineBold(target.text)).length
    ) {
      target.set(sanitizeInlineBold(next));
    }
  }
}
