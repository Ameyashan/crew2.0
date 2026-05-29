import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/claude";
import { logAgentRun } from "@/lib/agent-runs";
import { getProfile } from "@/lib/profile";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type {
  ResumeTailorInput,
  ResumeTailorStepEvent,
  TailoredResume,
} from "./types";

const MODEL = "claude-sonnet-4-6";

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

    const userPrompt = buildUserPrompt({
      ...input,
      resume_text: profile.resume_text,
      full_name: profile.full_name,
    });

    const started = Date.now();
    let text = "";
    let inTokens = 0;
    let outTokens = 0;
    let outcome: "ok" | "error" = "ok";
    let err: string | null = null;

    try {
      const stream = client().messages.stream({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
          } as unknown as Anthropic.Messages.Tool,
        ],
        messages: [{ role: "user", content: userPrompt }],
      });

      const toolBlocks = new Map<number, { name: string; partial: string }>();
      let lastProgressAt = 0;
      let lastProgressChars = 0;
      let textForProgress = "";

      for await (const evt of stream) {
        if (evt.type === "content_block_start") {
          const block = evt.content_block as {
            type: string;
            name?: string;
          };
          if (
            (block.type === "server_tool_use" || block.type === "tool_use") &&
            block.name === "web_search"
          ) {
            toolBlocks.set(evt.index, { name: block.name, partial: "" });
          }
        } else if (evt.type === "content_block_delta") {
          const delta = evt.delta as {
            type: string;
            text?: string;
            partial_json?: string;
          };
          if (delta.type === "text_delta" && delta.text) {
            text += delta.text;
            textForProgress += delta.text;
            const now = Date.now();
            if (
              now - lastProgressAt > 250 &&
              textForProgress.length - lastProgressChars > 80
            ) {
              const bullets = (textForProgress.match(/\.\s*"/g) || []).length;
              lastProgressAt = now;
              lastProgressChars = textForProgress.length;
              yield {
                type: "progress",
                chars: textForProgress.length,
                bullets,
              };
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
            if (query) {
              yield { type: "tool", name: "web_search", query };
            }
          }
        }
      }

      const final = await stream.finalMessage();
      inTokens = final.usage.input_tokens;
      outTokens = final.usage.output_tokens;
      // Prefer the SDK's reassembled text when available (it includes any
      // final text block we didn't capture via deltas).
      if (!text) {
        for (const block of final.content) {
          if (block.type === "text") text += block.text;
        }
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
        },
      });
    }

    const parsed = parseTailored(text, input);

    if (parsed.experience?.[0]?.bullets?.[0] === "JOB_FETCH_FAILED") {
      yield {
        type: "error",
        message:
          "Couldn't read the job posting (probably auth-walled). Paste the job description into Highlights and re-run.",
      };
      return;
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

  return {
    header: {
      full_name: header.full_name ?? "",
      headline: header.headline ?? "",
      location: header.location,
      email: header.email,
      phone: header.phone,
      links: header.links,
    },
    summary: raw.summary,
    experience: experience.map((e) => ({
      company: e.company ?? "",
      role: e.role ?? "",
      location: e.location,
      start: e.start ?? "",
      end: e.end ?? "",
      bullets: Array.isArray(e.bullets) ? e.bullets.filter(Boolean) : [],
    })),
    education: education.map((e) => ({
      school: e.school ?? "",
      degree: e.degree,
      field: e.field,
      start: e.start,
      end: e.end,
      notes: Array.isArray(e.notes) ? e.notes.filter(Boolean) : undefined,
    })),
    skills: skills?.map((s) => ({
      group: s.group ?? "",
      items: Array.isArray(s.items) ? s.items.filter(Boolean) : [],
    })),
    projects: projects?.map((p) => ({
      name: p.name ?? "",
      link: p.link,
      bullets: Array.isArray(p.bullets) ? p.bullets.filter(Boolean) : [],
    })),
    extras: extras?.map((x) => ({
      heading: x.heading ?? "",
      items: Array.isArray(x.items) ? x.items.filter(Boolean) : [],
    })),
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
