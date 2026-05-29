// @ts-nocheck — loose `any` parsed shapes, ported from compose prototype v3
"use client";

import { useSyncExternalStore } from "react";

/* ─────────────────────── types ─────────────────────── */

export type RunStage = "parsing" | "working" | "done" | "error";

export type Run = {
  id: string;
  input: string;
  intent?: string;
  providedEmail?: boolean;
  kind: "person" | "job";
  stage: RunStage;
  parsed: unknown;
  progress: Record<string, number>;
  drafts: unknown[] | null;
  enrichment: unknown;
  person: unknown;
  candidates: unknown[] | null;
  error: string | null;
  createdAt: number;
  // Resume "regenerate with notes" state (job runs only).
  regenerating?: boolean;
  regenError?: string | null;
};

/* ─────────────────────── module store ─────────────────────── */
// Mirrors the house pattern in components/paper/use-paper-theme.ts: a module
// singleton + subscriber set + useSyncExternalStore. Living outside the React
// tree means in-flight fetch/reader loops survive /app/* navigation (route
// children swap, the module persists). A full page refresh resets it.

const EMPTY: Run[] = [];
let runs: Run[] = [];
const controllers = new Map<string, AbortController>();
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// All mutations go through patch(), keyed by the primitive id. Sibling runs keep
// reference identity and are never clobbered by a concurrent stream.
function patch(id: string, updater: (r: Run) => Partial<Run>) {
  runs = runs.map((r) => (r.id === id ? { ...r, ...updater(r) } : r));
  emit();
}

export function useRuns(): Run[] {
  return useSyncExternalStore(
    subscribe,
    () => runs,
    () => EMPTY,
  );
}

/* ─────────────────────── actions ─────────────────────── */

export function startRun(
  input: string,
  opts?: { intent?: string; providedEmail?: boolean },
): string | null {
  const text = (input || "").trim();
  if (!text) return null;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const run: Run = {
    id,
    input: text,
    intent: opts?.intent || undefined,
    providedEmail: opts?.providedEmail || false,
    kind: detectKind(text),
    stage: "parsing",
    parsed: null,
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    candidates: null,
    error: null,
    createdAt: Date.now(),
  };

  // newest on top
  runs = [run, ...runs];
  emit();

  // ~900ms parse preview, then auto-confirm into the working stream.
  setTimeout(() => {
    if (!runs.some((r) => r.id === id)) return; // dismissed during parse
    const parsed = run.kind === "job" ? inferJobV3(text) : inferPersonV3(text);
    patch(id, () => ({
      parsed,
      candidates: run.kind === "person" ? parsed.candidates : null,
      stage: "working",
    }));
    launch(id);
  }, 900);

  return id;
}

export function dismissRun(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  runs = runs.filter((r) => r.id !== id);
  emit();
}

export function clearAllRuns() {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
  runs = [];
  emit();
}

export function retryRun(id: string, picked?: unknown) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  controllers.get(id)?.abort();
  controllers.delete(id);
  patch(id, () => ({
    stage: "working",
    progress: {},
    drafts: null,
    enrichment: null,
    person: null,
    error: null,
  }));
  launch(id, picked);
}

export function updateRun(id: string, partial: Partial<Run>) {
  patch(id, () => partial);
}

// Re-pick a different hiring-manager candidate on a finished job run. Re-runs
// only the email + draft for that person (server skips resume + sourcing) and
// patches the email/person/draft in place — the package card stays visible.
export async function pickCandidate(
  id: string,
  candidate: { name?: string; role?: string | null; company?: string | null; linkedin?: string | null },
) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job") return;
  const picked = {
    name: candidate?.name,
    role: candidate?.role ?? null,
    company: candidate?.company ?? null,
    linkedin: candidate?.linkedin ?? null,
  };
  if (!picked.name) return;

  const jobUrl = run.input.match(/^https?:\/\//) ? run.input : `https://${run.input}`;

  // Reflect the click immediately, then light the email/outreach bars.
  patch(id, (r) => ({
    person: {
      ...((r.person as object) || {}),
      name: picked.name,
      role: picked.role,
      company: picked.company,
      links: picked.linkedin ? { linkedin: picked.linkedin } : (r.person?.links || {}),
      context_lines: [],
    },
    progress: { ...r.progress, person: 100, email: 10, outreach: 10 },
  }));

  controllers.get(id)?.abort();
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    const res = await fetch("/api/compose/apply", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        job_url: jobUrl,
        picked,
        intent: run.intent || undefined,
        // Keep the cold email anchored on the job, not the picked person's own
        // company, when we re-draft for a different candidate.
        job_context: { role: run.parsed?.role ?? null, company: run.parsed?.company ?? null },
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`pick failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const collectedDrafts: unknown[] = [];
    let collectedEnrichment: unknown = null;
    let collectedPerson: unknown = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "step") {
          const k = evt.id;
          if (evt.status === "start") patch(id, (r) => ({ progress: { ...r.progress, [k]: 10 } }));
          else if (evt.status === "done" || evt.status === "skipped")
            patch(id, (r) => ({ progress: { ...r.progress, [k]: 100 } }));
          if (k === "person" && evt.status === "done" && evt.data) collectedPerson = evt.data;
          if (k === "email" && evt.data) collectedEnrichment = evt.data;
          if (k === "outreach" && evt.status === "done" && evt.data) collectedDrafts.push(evt.data);
        } else if (evt.type === "error") {
          throw new Error(evt.message || "pick error");
        }
      }
    }
    patch(id, (r) => ({
      drafts: collectedDrafts.length ? collectedDrafts : r.drafts,
      enrichment: collectedEnrichment || r.enrichment,
      person: collectedPerson || r.person,
      progress: { ...r.progress, person: 100, email: 100, outreach: 100 },
    }));
  } catch (e) {
    if (controller.signal.aborted) return; // dismissed/cleared
    // Keep the existing package; just restore the bars and log.
    patch(id, (r) => ({ progress: { ...r.progress, email: 100, outreach: 100 } }));
    console.error("[pickCandidate]", e);
  } finally {
    controllers.delete(id);
  }
}

// Re-run ONLY the resume agent for a finished job run, applying the user's
// "what to change" notes. Streams /api/resume/tailor and patches the tailored
// resume (+ ATS, role/company) in place — the rest of the package is untouched.
export async function regenerateResume(id: string, notes: string) {
  const run = runs.find((r) => r.id === id);
  if (!run || run.kind !== "job") return;
  const trimmed = (notes || "").trim();
  if (!trimmed || run.regenerating) return;

  const jobUrl = run.input.match(/^https?:\/\//) ? run.input : `https://${run.input}`;
  const pageCount = run.parsed?.resume?.meta?.page_count === 2 ? 2 : 1;

  patch(id, () => ({ regenerating: true, regenError: null }));

  try {
    const res = await fetch("/api/resume/tailor", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ job_url: jobUrl, regenerate_notes: trimmed, page_count: pageCount }),
    });
    if (!res.ok || !res.body) throw new Error(`regenerate failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let newResume: unknown = null;
    let newId: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "step" && evt.id === "tailor" && evt.status === "done" && evt.data?.resume) {
          newResume = evt.data.resume;
        } else if (evt.type === "saved") {
          newId = evt.id;
        } else if (evt.type === "error") {
          throw new Error(evt.message || "regenerate error");
        }
      }
    }
    if (!newResume) throw new Error("no resume returned");
    patch(id, (r) => ({
      parsed: {
        ...(r.parsed || {}),
        resume: newResume,
        ats_score: newResume?.meta?.ats_score ?? r.parsed?.ats_score,
        resume_generation_id: newId ?? r.parsed?.resume_generation_id,
        role: newResume?.meta?.target_role ?? r.parsed?.role,
        company: newResume?.meta?.target_company ?? r.parsed?.company,
      },
      regenerating: false,
      regenError: null,
    }));
  } catch (e) {
    patch(id, () => ({ regenerating: false, regenError: String(e?.message || e) }));
  }
}

/* ─────────────────────── streaming ─────────────────────── */

function launch(id: string, picked?: unknown) {
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  void streamRun(run, controller.signal, picked);
}

async function streamRun(run: Run, signal: AbortSignal, picked?: unknown) {
  const id = run.id;

  try {
    if (run.kind === "job") {
      // ── job path ── stream /api/compose/apply (tailor + reach-out)
      const collectedDrafts: unknown[] = [];
      let collectedEnrichment: unknown = null;
      let collectedPerson: unknown = null;
      let collectedCandidates: unknown[] | null = null;
      let bundle = { ats_score: null, target_role: null, target_company: null, team: null, resume: null };
      const jobUrl = run.input.match(/^https?:\/\//)
        ? run.input
        : `https://${run.input}`;

      const res = await fetch("/api/compose/apply", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ job_url: jobUrl, intent: run.intent || undefined }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`apply failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const raw of parts) {
          const line = raw.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let evt;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "step") {
            const k = evt.id; // resume | person | email | outreach
            if (evt.status === "start") patch(id, (r) => ({ progress: { ...r.progress, [k]: 10 } }));
            else if (evt.status === "done" || evt.status === "skipped")
              patch(id, (r) => ({ progress: { ...r.progress, [k]: 100 } }));
            if (k === "resume" && evt.status === "done" && evt.data) {
              bundle = { ...bundle, ...evt.data };
            }
            if (k === "person" && evt.status === "done" && evt.data) collectedPerson = evt.data;
            if (k === "email" && evt.data) collectedEnrichment = evt.data;
            if (k === "outreach" && evt.status === "done" && evt.data) {
              collectedDrafts.push(evt.data);
            }
          } else if (evt.type === "candidates") {
            collectedCandidates = Array.isArray(evt.data) ? evt.data : [];
            patch(id, () => ({ candidates: collectedCandidates }));
          } else if (evt.type === "error") {
            throw new Error(evt.message || "apply error");
          }
        }
      }
      patch(id, (r) => ({
        drafts: collectedDrafts.length ? collectedDrafts : r.drafts,
        enrichment: collectedEnrichment || r.enrichment,
        person: collectedPerson || r.person,
        candidates: collectedCandidates ?? r.candidates,
        // Map the API's target_role/target_company onto the card's role/company
        // so a successful parse replaces the preview.
        parsed: {
          ...(r.parsed || {}),
          ...bundle,
          unparsed: false,
          role: bundle.target_role || r.parsed?.role,
          company: bundle.target_company || r.parsed?.company,
          team: bundle.team ?? r.parsed?.team,
          ats_score: bundle.ats_score ?? r.parsed?.ats_score,
          resume: bundle.resume ?? r.parsed?.resume,
        },
        progress: { resume: 100, person: 100, email: 100, outreach: 100 },
        stage: "done",
      }));
      return;
    }

    // ── person path ── stream /api/compose (reach-out agent). Map SSE step
    // events to the three progress keys the AgentRow expects.
    const stepToKey: Record<string, string> = {
      research: "person",
      email_lookup: "email",
      draft: "outreach",
    };
    const collectedDrafts: unknown[] = [];
    let collectedEnrichment: unknown = null;
    let completed = false;

    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        text: run.input,
        intent: run.intent || undefined,
        picked: picked || undefined,
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`compose failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const raw of parts) {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "step") {
          const key = stepToKey[evt.id];
          if (key) {
            if (evt.status === "start") patch(id, (r) => ({ progress: { ...r.progress, [key]: 10 } }));
            else if (evt.status === "done" || evt.status === "skipped")
              patch(id, (r) => ({ progress: { ...r.progress, [key]: 100 } }));
          }
          if (evt.id === "email_lookup" && evt.data) collectedEnrichment = evt.data;
          if (evt.id === "draft" && evt.status === "done" && evt.data) {
            collectedDrafts.push(evt.data);
          }
        } else if (evt.type === "needs_disambiguation") {
          patch(id, () => ({
            stage: "error",
            error: "Multiple people matched — pick the right one below.",
            candidates: Array.isArray(evt.data) ? evt.data : null,
          }));
          return;
        } else if (evt.type === "complete") {
          completed = true;
          patch(id, (r) => ({
            enrichment: collectedEnrichment || r.enrichment,
            drafts: collectedDrafts.length ? collectedDrafts : r.drafts,
            progress: { person: 100, email: 100, outreach: 100 },
            stage: "done",
          }));
        } else if (evt.type === "error") {
          throw new Error(evt.message || "compose error");
        }
      }
    }
    // Some streams end without an explicit 'complete' event — fall through.
    if (!completed && collectedDrafts.length) {
      patch(id, (r) => ({
        enrichment: collectedEnrichment || r.enrichment,
        drafts: collectedDrafts,
        progress: { person: 100, email: 100, outreach: 100 },
        stage: "done",
      }));
    }
  } catch (e) {
    if (signal.aborted) return; // dismissed/cleared — not an error
    patch(id, () => ({ stage: "error", error: String(e?.message || e) }));
  } finally {
    controllers.delete(id);
  }
}

/* ─────────────────────── parsing helpers (own the parse) ─────────────────────── */

export function detectKind(s: string): "person" | "job" {
  const lo = (s || "").toLowerCase();
  if (/\b(jobs?|careers?|hiring|posting|positions?)\b/.test(lo)) return "job";
  if (/(greenhouse|lever|ashbyhq|workable|wellfound|builtin|workday)\.io|com/.test(lo)) return "job";
  if (lo.includes("/jobs/") || lo.includes("/careers/") || lo.includes("careers.")) return "job";
  return "person";
}

function inferPersonV3(input: string) {
  const lo = (input || "").toLowerCase();
  if (lo.includes("maya")) {
    return {
      chosen: makeP("Maya Rao", "MR", "Head of Ops", "Ramp", "ramp", "Maya", 92, "NYC",
        "posted 4h ago about hiring ops", ["shipped Bill Pay ops in 8mo", "ex-Brex, Capital One", "replies long-form", 'allergic to "circling back"']),
      candidates: [
        makeP("Maya Rao", "MR", "Head of Ops", "Ramp", "ramp", "Maya", 92, "NYC"),
        makeP("Maya Patel", "MP", "Sr Ops Lead", "Ramp · Bill Pay", "ramp", "Maya", 78, "NYC"),
        makeP("Maya Gupta", "MG", "Ops PM", "Ramp", "ramp", "Maya", 64, "Remote"),
      ],
    };
  }
  if (lo.includes("anika") || lo.includes("stripe")) {
    return {
      chosen: makeP("Anika Mehta", "AM", "Senior Product Designer", "Stripe", "stripe", "Anika", 96, "NYC",
        "last post 4h · Atlas pricing thread", ["shipped Atlas pricing redesign", "long-form > 1-liners", "IIT-D · Stanford d.school", 'hates "hope this finds you well"']),
      candidates: [
        makeP("Anika Mehta", "AM", "Senior Product Designer", "Stripe", "stripe", "Anika", 96, "NYC"),
        makeP("Aniket Sharma", "AS", "Product Designer", "Stripe", "stripe", "Aniket", 71, "SF"),
        makeP("Anita Rao", "AR", "PM · Atlas", "Stripe", "stripe", "Anita", 68, "NYC"),
      ],
    };
  }
  return {
    chosen: makeP("Vishnu Sivaji", "VS", "Product Director", "Google DeepMind", "google", "Vishnu", 88, "London",
      "recently joined · 1mo ago", ["ex-Anthropic research", "transitioning to / recently joined Google DeepMind", "writes long-form", "prefers cold DMs over emails"]),
    candidates: [
      makeP("Vishnu Sivaji", "VS", "Product Director", "Google DeepMind", "google", "Vishnu", 88, "London"),
      makeP("Vinod Shankar", "VS", "Engineering Director", "Google DeepMind", "google", "Vinod", 62, "Mountain View"),
      makeP("Vivek Singh", "VS", "Product Lead", "Google", "google", "Vivek", 58, "Bangalore"),
    ],
  };
}

function makeP(name, initials, role, company, slug, firstName, confidence, location, signal = "replies long-form", facts: string[] = []) {
  return {
    name, initials, role, company,
    companySlug: slug, firstName, confidence, location,
    signal,
    angle: "pricing tables in Atlas",
    recent: "Atlas pricing redesign",
    detail: "discount-stacking edge case",
    facts: facts.length ? facts : ["recent product launches", "replies long-form", "writes on x weekly"],
  };
}

function inferJobV3(input: string) {
  const lo = (input || "").toLowerCase();
  if (lo.includes("stripe")) return {
    logo: "S", company: "Stripe · Payments", role: "Senior Product Designer · Atlas",
    location: "NYC · hybrid", comp: "$220k–$280k", posted: "Posted 3d ago",
    tags: ["design systems", "fintech", "b2b", "shipped products", "figma + prototyping"],
  };
  if (lo.includes("ramp")) return {
    logo: "R", company: "Ramp", role: "Staff Engineer · Bill Pay",
    location: "NYC · onsite 3d", comp: "$260k–$340k", posted: "Posted 6d ago",
    tags: ["typescript", "postgres", "high-throughput", "payments rails", "led teams 5+"],
  };
  if (lo.includes("anthropic")) return {
    logo: "A", company: "Anthropic", role: "Design Engineer · Claude",
    location: "SF · onsite 3d", comp: "$240k–$320k", posted: "Posted 1d ago",
    tags: ["react + typescript", "tight design taste", "shipped LLM UX", "systems thinking"],
  };
  // Unknown: real fetch+parse runs server-side on send. Return an honest
  // "not parsed yet" shape, not fabricated company/role/skills.
  return { unparsed: true, source: (input || "").trim() };
}

export function jobHost(source: string) {
  const s = (source || "").trim();
  if (!s) return "";
  try {
    return new URL(s.match(/^https?:\/\//) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}
