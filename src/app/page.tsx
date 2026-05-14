"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Channel = "email" | "x_dm" | "linkedin";

interface DraftRow {
  id: string;
  channel: Channel;
  subject: string | null;
  body: string;
}

interface Candidate {
  name: string;
  role?: string | null;
  company?: string | null;
  location?: string | null;
  linkedin?: string | null;
  why?: string | null;
}

interface ResearchData {
  name: string | null;
  role: string | null;
  company: string | null;
  links: Record<string, string>;
  context_lines: string[];
  match_confidence?: "high" | "medium" | "low";
}

interface EmailLookup {
  email: string | null;
  confidence: number;
  source: string;
  domain?: string | null;
  guesses?: { email: string; pattern: string }[];
  message?: string | null;
}

interface PersonInfo {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
}

type StepStatus = "idle" | "running" | "done" | "skipped";

interface Steps {
  research: StepStatus;
  email_lookup: StepStatus;
  person_saved: StepStatus;
  draft_email: StepStatus;
  draft_x_dm: StepStatus;
  draft_linkedin: StepStatus;
}

const INITIAL_STEPS: Steps = {
  research: "idle",
  email_lookup: "idle",
  person_saved: "idle",
  draft_email: "idle",
  draft_x_dm: "idle",
  draft_linkedin: "idle",
};

const TABS: { key: Channel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "x_dm", label: "X DM" },
  { key: "linkedin", label: "LinkedIn" },
];

type Phase = "idle" | "identifying" | "picking" | "drafting" | "done" | "error";

function isUrlInput(text: string) {
  const t = text.trim();
  return /^https?:\/\/(www\.)?linkedin\.com\//i.test(t) || /^https?:\/\/(twitter|x)\.com\//i.test(t);
}

export default function ComposePage() {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState("");
  const [intentImage, setIntentImage] = useState<File | null>(null);
  const [intentImagePreview, setIntentImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const intentImageRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [steps, setSteps] = useState<Steps>(INITIAL_STEPS);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [person, setPerson] = useState<PersonInfo | null>(null);
  const [emailLookup, setEmailLookup] = useState<EmailLookup | null>(null);
  const [pickedEmail, setPickedEmail] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Channel>("email");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [sentMarks, setSentMarks] = useState<Record<string, boolean>>({});
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => setNeedsOnboarding(!j.profile?.onboarded_at));
  }, []);

  function reset() {
    setPhase("idle");
    setCandidates(null);
    setSteps(INITIAL_STEPS);
    setResearch(null);
    setPerson(null);
    setEmailLookup(null);
    setPickedEmail(null);
    setDrafts([]);
    setError(null);
    setEdits({});
    setEditing({});
    setSentMarks({});
  }

  const ALLOWED_INTENT_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  const MAX_INTENT_IMAGE_BYTES = 5 * 1024 * 1024;

  function chooseIntentImage(file: File | null) {
    setImageError(null);
    if (!file) {
      setIntentImage(null);
      if (intentImagePreview) URL.revokeObjectURL(intentImagePreview);
      setIntentImagePreview(null);
      return;
    }
    if (!ALLOWED_INTENT_IMAGE_TYPES.includes(file.type)) {
      setImageError("Use a PNG, JPG, WEBP, or GIF screenshot.");
      return;
    }
    if (file.size > MAX_INTENT_IMAGE_BYTES) {
      setImageError("Screenshot must be 5MB or smaller.");
      return;
    }
    if (intentImagePreview) URL.revokeObjectURL(intentImagePreview);
    setIntentImage(file);
    setIntentImagePreview(URL.createObjectURL(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || phase === "identifying" || phase === "drafting") return;
    reset();

    // If the user pasted a URL, the recipient is already pinned — skip identify.
    if (isUrlInput(text)) {
      await runDraft(text);
      return;
    }

    setPhase("identifying");
    try {
      const r = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: intent || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCandidates(j.candidates ?? []);
      setPhase("picking");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  async function pickCandidate(c: Candidate) {
    // Anchor on LinkedIn URL if available; otherwise fall back to "Name at Company"
    const anchor = c.linkedin || [c.name, c.company].filter(Boolean).join(" at ");
    await runDraft(anchor, c);
  }

  async function runDraft(composeInput: string, picked?: Candidate) {
    setPhase("drafting");
    setSteps(INITIAL_STEPS);
    setError(null);

    try {
      const r = await (intentImage
        ? (() => {
            const fd = new FormData();
            fd.append("text", composeInput);
            if (intent) fd.append("intent", intent);
            if (picked) fd.append("picked", JSON.stringify(picked));
            fd.append("intent_image", intentImage);
            return fetch("/api/compose", { method: "POST", body: fd });
          })()
        : fetch("/api/compose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: composeInput,
              intent: intent || undefined,
              picked: picked ?? undefined,
            }),
          }));
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          handleEvent(JSON.parse(line.slice(6)));
        }
      }
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  function handleEvent(evt: Record<string, unknown> & { type: string }) {
    if (evt.type === "step") {
      const id = evt.id as string;
      const status = evt.status as "start" | "done";
      if (id === "research") {
        setSteps((s) => ({ ...s, research: status === "start" ? "running" : "done" }));
        if (status === "done") setResearch(evt.data as ResearchData);
      } else if (id === "email_lookup") {
        setSteps((s) => ({ ...s, email_lookup: status === "start" ? "running" : "done" }));
        if (status === "done") setEmailLookup(evt.data as EmailLookup);
      } else if (id === "person_saved") {
        setSteps((s) => ({ ...s, person_saved: "done" }));
        setPerson(evt.data as PersonInfo);
      } else if (id === "draft") {
        const ch = evt.channel as Channel;
        const key =
          ch === "email" ? "draft_email" : ch === "x_dm" ? "draft_x_dm" : "draft_linkedin";
        setSteps((s) => ({ ...s, [key]: status === "start" ? "running" : "done" }));
        if (status === "done") {
          const d = evt.data as DraftRow;
          setDrafts((prev) => [...prev.filter((x) => x.channel !== d.channel), d]);
        }
      }
    } else if (evt.type === "error") {
      setError(String(evt.message));
    }
  }

  function bodyOf(d: DraftRow) {
    return edits[d.id] ?? d.body;
  }

  async function copyAndOpen(d: DraftRow) {
    const body = bodyOf(d);
    await navigator.clipboard.writeText(body).catch(() => {});
    if (d.channel === "email") {
      const to = pickedEmail ?? emailLookup?.email ?? "";
      const subject = encodeURIComponent(d.subject ?? "");
      const bodyEnc = encodeURIComponent(body);
      window.open(`mailto:${to}?subject=${subject}&body=${bodyEnc}`, "_blank");
      try {
        await fetch(`/api/draft/${d.id}/sent`, { method: "POST" });
        setSentMarks((m) => ({ ...m, [d.id]: true }));
      } catch {}
    }
  }

  const busy = phase === "identifying" || phase === "drafting";

  return (
    <div className="space-y-6">
      {needsOnboarding && (
        <div className="rounded-lg border border-[color:var(--color-clay)]/40 bg-[color:var(--color-cream-50)] px-4 py-3 text-sm flex items-center justify-between">
          <span>Set up your profile so drafts use your background and voice.</span>
          <Link
            href="/onboarding"
            className="rounded-md bg-[color:var(--color-clay)] px-3 py-1 text-xs text-white hover:bg-[color:var(--color-clay-dark)]"
          >
            Set up Crew →
          </Link>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-clay)]">
            Reach Out · Compose
          </div>
          <div className="text-[11px] font-mono text-[color:var(--color-ink-muted)]">
            ⌘ N · new
          </div>
        </div>
        <h1
          className="text-5xl text-[color:var(--color-ink)] leading-tight"
          style={{ fontFamily: "var(--font-newsreader)" }}
        >
          Who are you reaching out to?
        </h1>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] px-6 py-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-clay)] mb-3">
                Paste a link, name, or free-text
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='x.com/maya  ·  linkedin.com/in/…  ·  "the woman who runs ops at Ramp"'
                className="w-full min-h-[56px] resize-y bg-transparent text-base font-mono text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-muted)] outline-none"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-line)] bg-white/60 px-3 py-1.5 text-sm text-[color:var(--color-ink)] hover:border-[color:var(--color-clay)] disabled:opacity-50"
            >
              <span className="text-xs">↵</span>
              {phase === "identifying" ? "Finding…" : phase === "drafting" ? "Working…" : "Go"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[color:var(--color-ink-muted)] uppercase tracking-wider text-[10px]">
              Try:
            </span>
            {[
              { label: "x post", value: "https://x.com/" },
              { label: "linkedin url", value: "https://www.linkedin.com/in/" },
              { label: "free-text", value: "the woman who runs ops at Ramp" },
            ].map((t) => (
              <button
                type="button"
                key={t.label}
                onClick={() => setText(t.value)}
                className="rounded-md border border-[color:var(--color-line)] bg-white/40 px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-ink)] hover:border-[color:var(--color-clay)]"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What do you want? (optional, e.g. 'PM at Wayfair')"
          className="w-full rounded-lg border border-[color:var(--color-line)] bg-white/40 px-4 py-2 text-sm outline-none focus:border-[color:var(--color-clay)] focus:ring-1 focus:ring-[color:var(--color-clay)]"
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {intentImage && intentImagePreview ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-line)] bg-white/60 py-1 pl-1 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={intentImagePreview}
                alt="attached screenshot"
                className="h-8 w-8 rounded object-cover"
              />
              <span className="max-w-[180px] truncate text-[color:var(--color-ink)]">
                {intentImage.name}
              </span>
              <button
                type="button"
                onClick={() => chooseIntentImage(null)}
                className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
                aria-label="remove screenshot"
              >
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => intentImageRef.current?.click()}
              className="rounded-md border border-dashed border-[color:var(--color-line)] bg-white/40 px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-ink-muted)] hover:border-[color:var(--color-clay)]"
            >
              ＋ attach screenshot
            </button>
          )}
          <span className="text-[color:var(--color-ink-muted)]">
            PNG, JPG, WEBP, GIF · max 5MB · optional
          </span>
          <input
            ref={intentImageRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              chooseIntentImage(f);
              e.target.value = "";
            }}
          />
        </div>
        {imageError && <span className="block text-sm text-red-700">{imageError}</span>}
        {error && <span className="block text-sm text-red-700">{error}</span>}
      </form>

      {phase === "identifying" && (
        <div className="rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4 text-sm text-[color:var(--color-ink-muted)]">
          <span className="inline-block mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--color-clay)]" />
          Searching LinkedIn for matching people…
        </div>
      )}

      {phase === "picking" && candidates && (
        <CandidatePicker
          candidates={candidates}
          onPick={pickCandidate}
          onRetry={() => reset()}
        />
      )}

      {(phase === "drafting" || phase === "done") && <ProgressList steps={steps} />}

      {research && person && emailLookup && (
        <section className="rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div
                className="text-xl"
                style={{ fontFamily: "var(--font-newsreader)" }}
              >
                {person.name}
              </div>
              <div className="text-sm text-[color:var(--color-ink-muted)]">
                {[person.role, person.company].filter(Boolean).join(" · ")}
              </div>
              {research.match_confidence && (
                <ConfidencePill level={research.match_confidence} />
              )}
            </div>
            <EmailBadge lookup={emailLookup} pickedEmail={pickedEmail} />
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {research.context_lines.filter(Boolean).map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[color:var(--color-clay)]">·</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
          {emailLookup.message && emailLookup.source !== "apollo_verified" && (
            <div className="mt-3 rounded-md border border-[color:var(--color-clay)]/40 bg-[color:var(--color-cream-50)] px-3 py-2 text-xs text-[color:var(--color-ink)]">
              {emailLookup.message}
            </div>
          )}
          {!emailLookup.email && emailLookup.guesses && emailLookup.guesses.length > 0 && (
            <EmailGuesses
              guesses={emailLookup.guesses}
              domain={emailLookup.domain ?? null}
              picked={pickedEmail}
              onPick={(e) => setPickedEmail(e)}
            />
          )}
        </section>
      )}

      {drafts.length > 0 && person && emailLookup && (
        <div>
          <div className="flex gap-1 border-b border-[color:var(--color-line)]">
            {TABS.map((t) => {
              const d = drafts.find((x) => x.channel === t.key);
              if (!d) return null;
              return (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className={`-mb-px px-4 py-2 text-sm border-b-2 ${
                    active === t.key
                      ? "border-[color:var(--color-clay)] text-[color:var(--color-ink)]"
                      : "border-transparent text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {drafts.map((d) =>
            d.channel !== active ? null : (
              <DraftPanel
                key={d.id}
                draft={d}
                body={bodyOf(d)}
                editing={!!editing[d.id]}
                sent={!!sentMarks[d.id]}
                emailLookup={emailLookup}
                hasEmailTarget={!!(emailLookup.email || pickedEmail)}
                onEditToggle={() => setEditing((s) => ({ ...s, [d.id]: !s[d.id] }))}
                onChange={(v) => setEdits((s) => ({ ...s, [d.id]: v }))}
                onCopyAndOpen={() => copyAndOpen(d)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function CandidatePicker({
  candidates,
  onPick,
  onRetry,
}: {
  candidates: Candidate[];
  onPick: (c: Candidate) => void;
  onRetry: () => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4 space-y-3">
        <p className="text-sm">
          No matches found. Try adding a company or city to the intent line, or paste a LinkedIn URL.
        </p>
        <button
          onClick={onRetry}
          className="text-sm text-[color:var(--color-clay)] hover:underline"
        >
          ← back
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4 space-y-3">
      <div>
        <h2
          className="text-lg"
          style={{ fontFamily: "var(--font-newsreader)" }}
        >
          Which one is your target?
        </h2>
        <p className="text-xs text-[color:var(--color-ink-muted)]">
          Pick a person to research and draft. Sorted by best match to your intent.
        </p>
      </div>
      <ul className="divide-y divide-[color:var(--color-line)]">
        {candidates.map((c, i) => (
          <li key={i} className="py-3">
            <button
              onClick={() => onPick(c)}
              className="w-full text-left rounded-md hover:bg-[color:var(--color-cream-50)] -mx-2 px-2 py-1"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[color:var(--color-ink-muted)] truncate">
                    {[c.role, c.company, c.location].filter(Boolean).join(" · ") || c.linkedin || ""}
                  </div>
                  {c.why && (
                    <div className="text-xs text-[color:var(--color-clay)] mt-1">{c.why}</div>
                  )}
                  {c.linkedin && (
                    <div className="text-[11px] font-mono text-[color:var(--color-ink-muted)] truncate mt-0.5">
                      {c.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                    </div>
                  )}
                </div>
                <span className="text-xs text-[color:var(--color-clay)] whitespace-nowrap">use →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between pt-1 text-xs">
        <button onClick={onRetry} className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">
          ← none of these — start over
        </button>
        <span className="text-[color:var(--color-ink-muted)]">
          tip: paste a LinkedIn URL to skip this step
        </span>
      </div>
    </div>
  );
}

const STEP_LABELS: { key: keyof Steps; label: string }[] = [
  { key: "research", label: "Researching the person" },
  { key: "email_lookup", label: "Finding email" },
  { key: "person_saved", label: "Saving to memory" },
  { key: "draft_email", label: "Drafting email" },
  { key: "draft_x_dm", label: "Drafting X DM" },
  { key: "draft_linkedin", label: "Drafting LinkedIn" },
];

function ProgressList({ steps }: { steps: Steps }) {
  return (
    <ol className="space-y-1.5 rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4 text-sm">
      {STEP_LABELS.map(({ key, label }) => {
        const s = steps[key];
        return (
          <li key={key} className="flex items-center gap-3">
            <span className="w-4 inline-flex justify-center">{glyph(s)}</span>
            <span
              className={
                s === "done"
                  ? ""
                  : s === "running"
                    ? "text-[color:var(--color-ink)]"
                    : "text-[color:var(--color-ink-muted)]"
              }
            >
              {label}
              {s === "running" && "…"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function glyph(s: StepStatus) {
  if (s === "done") return <span className="text-[color:var(--color-clay)]">✓</span>;
  if (s === "running")
    return (
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--color-clay)]" />
    );
  if (s === "skipped") return <span className="text-[color:var(--color-ink-muted)]">—</span>;
  return <span className="text-[color:var(--color-ink-muted)]">○</span>;
}

function ConfidencePill({ level }: { level: "high" | "medium" | "low" }) {
  const map = {
    high: { label: "high confidence match", bg: "#e3efe3", fg: "#2f7a4d" },
    medium: { label: "medium confidence — verify", bg: "#f6ecd1", fg: "#7a5a1f" },
    low: { label: "low confidence — likely wrong person", bg: "#f4dcd4", fg: "#9a4830" },
  } as const;
  const m = map[level];
  return (
    <span
      className="mt-1 inline-block rounded px-2 py-0.5 text-[10px] uppercase tracking-wide"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

function EmailBadge({
  lookup,
  pickedEmail,
}: {
  lookup: EmailLookup;
  pickedEmail?: string | null;
}) {
  if (pickedEmail) {
    return (
      <div className="text-right">
        <div className="font-mono text-xs">{pickedEmail}</div>
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-clay)]">
          your guess
        </div>
      </div>
    );
  }
  if (!lookup.email) {
    const label = "no email match";
    return (
      <span className="rounded bg-[color:var(--color-cream-200)] px-2 py-1 font-mono text-xs text-[color:var(--color-ink-muted)]">
        {label}
      </span>
    );
  }
  const pct = Math.round(lookup.confidence * 100);
  return (
    <div className="text-right">
      <div className="font-mono text-xs">{lookup.email}</div>
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-ink-muted)]">
        {sourceLabel(lookup.source)} · {pct}%
      </div>
    </div>
  );
}

function sourceLabel(s: string): string {
  if (s === "apollo_verified") return "verified";
  if (s === "apollo_guessed") return "pattern guess";
  if (s === "apollo_unverified") return "unverified";
  if (s === "apollo_catch_all") return "catch-all";
  return s.replace("apollo_", "");
}

function EmailGuesses({
  guesses,
  domain,
  picked,
  onPick,
}: {
  guesses: { email: string; pattern: string }[];
  domain: string | null;
  picked: string | null;
  onPick: (e: string) => void;
}) {
  return (
    <div className="mt-4 rounded-md border border-dashed border-[color:var(--color-line)] p-3 text-xs">
      <div className="text-[color:var(--color-ink-muted)] mb-2">
        Apollo didn&apos;t verify an email. Common formats for{" "}
        <span className="font-mono">{domain ?? "this company"}</span>:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {guesses.map((g) => (
          <button
            key={g.email}
            onClick={() => onPick(g.email)}
            className={`rounded-full border px-2 py-1 font-mono text-[11px] ${
              picked === g.email
                ? "border-[color:var(--color-clay)] bg-[color:var(--color-clay)] text-white"
                : "border-[color:var(--color-line)] hover:border-[color:var(--color-clay)]"
            }`}
            title={g.pattern}
          >
            {g.email}
          </button>
        ))}
      </div>
      {picked && (
        <div className="mt-2 text-[color:var(--color-ink-muted)]">
          Using <span className="font-mono">{picked}</span> in the Gmail link. Verify before sending.
        </div>
      )}
    </div>
  );
}

function DraftPanel({
  draft,
  body,
  editing,
  sent,
  emailLookup,
  hasEmailTarget,
  onEditToggle,
  onChange,
  onCopyAndOpen,
}: {
  draft: DraftRow;
  body: string;
  editing: boolean;
  sent: boolean;
  emailLookup: EmailLookup;
  hasEmailTarget: boolean;
  onEditToggle: () => void;
  onChange: (v: string) => void;
  onCopyAndOpen: () => void;
}) {
  return (
    <div className="rounded-b-lg border-x border-b border-[color:var(--color-line)] bg-white/40 p-4 space-y-3">
      {draft.subject && (
        <div className="text-sm">
          <span className="text-[color:var(--color-ink-muted)] mr-2">Subject:</span>
          <span>{draft.subject}</span>
        </div>
      )}
      {editing ? (
        <textarea
          value={body}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-h-[200px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 font-mono text-sm leading-relaxed outline-none focus:border-[color:var(--color-clay)]"
        />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
          {body}
        </pre>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onCopyAndOpen}
          className="rounded-md bg-[color:var(--color-ink)] px-3 py-1.5 text-sm text-white hover:bg-black"
        >
          {draft.channel === "email"
            ? hasEmailTarget
              ? "Copy & open Gmail"
              : "Copy"
            : "Copy"}
        </button>
        <button
          onClick={onEditToggle}
          className="text-sm text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
        >
          {editing ? "Done" : "Edit"}
        </button>
        {sent && <span className="text-xs text-[color:var(--color-clay)]">marked sent</span>}
      </div>
    </div>
  );
}
