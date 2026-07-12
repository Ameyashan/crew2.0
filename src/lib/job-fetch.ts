// Direct readers for the ATS boards that expose a public JSON API for a single
// posting (Greenhouse, Lever). Handing Claude a bare job URL and asking it to
// web_search for the posting is unreliable for numeric ATS URLs — the model can
// land on a *different* opening at the same company (e.g. "Design Engineer,
// Claude" instead of the "Product Manager, Human Data Platform" the URL points
// to). When the URL is a known ATS, fetch the exact posting straight from the
// source so the resume tailor and the job-meta parser read the right job.
//
// Everything here is best-effort: any failure returns null and the callers fall
// back to the existing web_search path, so this can only improve accuracy.

import { getJson, str, htmlToText, slugToName } from "@/lib/jobs/util";

export interface FetchedJob {
  title: string | null; // the role title exactly as posted
  company: string | null; // hiring company (slug-derived when the API omits it)
  team: string | null; // department/team the role sits in, if the API exposes it
  location: string | null;
  text: string; // plain-text JD body
  // Free-text/essay questions the application form asks ("Why <company>?",
  // "Tell us about a project…"). Empty when the board doesn't expose them or the
  // form has none. Only Greenhouse exposes these via its public API today.
  questions: string[];
  source: "greenhouse" | "lever";
  url: string;
}

// A label matching one of these reads as a free-text essay prompt even when the
// underlying field type isn't a textarea (some forms use a short-text input for
// a "why" question). Used as a secondary include on top of the textarea signal.
const ESSAY_LABEL_RE =
  /\b(why|tell us|describe|cover letter|what (excites|interests|draws|motivates)|motivat|passion|proud of|in your own words)\b/i;

// A label matching one of these is a mechanical/compliance field we never want
// to surface as an essay question, even if it somehow lands in a textarea.
const NON_ESSAY_LABEL_RE =
  /\b(gender|race|ethnicity|veteran|disability|sexual orientation|salary|compensation|expected pay|start date|notice period|work authoriz|authorized to work|visa|sponsorship|relocat|referr|how did you hear|linkedin|website|portfolio|github|pronoun)\b/i;

// Greenhouse returns the application form as `questions[]`, each with a `label`
// and one or more `fields[]` (each typed: input_text | textarea | input_file |
// multi_value_*_select | boolean). Keep only the free-text essay prompts: a
// question with a textarea field, or one whose label reads like an essay — while
// dropping the demographic/logistics fields the user asked us NOT to answer.
export function extractApplicationQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const label = str((q as { label?: unknown }).label);
    if (!label) continue;
    if (NON_ESSAY_LABEL_RE.test(label)) continue;
    const fields = Array.isArray((q as { fields?: unknown }).fields)
      ? ((q as { fields: unknown[] }).fields)
      : [];
    const fieldType = (f: unknown) =>
      f && typeof f === "object" ? (f as { type?: unknown }).type : undefined;
    // A document upload ("Resume/CV", "Cover letter" file) — even one that offers
    // a paste-instead textarea — isn't an essay prompt we answer. Skip it.
    if (fields.some((f) => fieldType(f) === "input_file")) continue;
    const hasTextarea = fields.some((f) => fieldType(f) === "textarea");
    if (!hasTextarea && !ESSAY_LABEL_RE.test(label)) continue;
    const key = label.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label.trim());
  }
  return out;
}

export async function fetchAtsPosting(url: string): Promise<FetchedJob | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  try {
    if (host.endsWith("greenhouse.io")) return await fetchGreenhouse(u);
    if (host.endsWith("lever.co")) return await fetchLever(u);
  } catch {
    return null;
  }
  return null;
}

// https://job-boards.greenhouse.io/{board}/jobs/{id}
// https://boards.greenhouse.io/{board}/jobs/{id}
// → https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}
async function fetchGreenhouse(u: URL): Promise<FetchedJob | null> {
  const parts = u.pathname.split("/").filter(Boolean);
  const jobsIdx = parts.indexOf("jobs");
  if (jobsIdx < 1) return null;
  const board = parts[0];
  const id = (parts[jobsIdx + 1] ?? "").replace(/[^0-9]/g, "");
  if (!board || !id) return null;

  // ?questions=true asks Greenhouse to include the application form's questions
  // alongside the posting, so we can surface the essay prompts ("Why <company>?")
  // the user would otherwise only see on the apply page.
  const data = await getJson<{
    title?: unknown;
    content?: unknown;
    company_name?: unknown;
    departments?: { name?: unknown }[];
    location?: { name?: unknown };
    questions?: unknown;
  }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}?questions=true`);
  if (!data) return null;
  const text = htmlToText(typeof data.content === "string" ? data.content : "");
  if (!text) return null;
  return {
    title: typeof data.title === "string" ? data.title : null,
    company:
      (typeof data.company_name === "string" && data.company_name) || slugToName(board),
    team: str(data.departments?.[0]?.name),
    location: str(data.location?.name),
    text,
    questions: extractApplicationQuestions(data.questions),
    source: "greenhouse",
    url: u.toString(),
  };
}

// https://jobs.lever.co/{site}/{id} → https://api.lever.co/v0/postings/{site}/{id}
async function fetchLever(u: URL): Promise<FetchedJob | null> {
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const site = parts[0];
  const id = parts[1];
  if (!site || !id) return null;

  const data = await getJson<{
    text?: unknown;
    description?: unknown;
    descriptionPlain?: unknown;
    categories?: { team?: unknown; department?: unknown; location?: unknown };
  }>(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(id)}`);
  if (!data) return null;
  const text =
    (typeof data.descriptionPlain === "string" && data.descriptionPlain.trim()) ||
    htmlToText(typeof data.description === "string" ? data.description : "");
  if (!text) return null;
  return {
    title: typeof data.text === "string" ? data.text : null,
    company: slugToName(site),
    team: str(data.categories?.team) ?? str(data.categories?.department),
    location: str(data.categories?.location),
    text,
    // Lever's public postings API doesn't expose the application form's custom
    // questions, so callers fall back to LLM extraction from the JD text.
    questions: [],
    source: "lever",
    url: u.toString(),
  };
}
