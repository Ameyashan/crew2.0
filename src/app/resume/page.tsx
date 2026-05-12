"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ResumePreview } from "@/components/resume/ResumePreview";
import type {
  ResumeTailorStepEvent,
  TailoredResume,
} from "@/lib/agents/resume-tailor/types";

interface Profile {
  full_name: string | null;
  linkedin_url: string | null;
  resume_text: string | null;
  resume_filename: string | null;
  onboarded_at: string | null;
}

type Status =
  | { phase: "idle" }
  | {
      phase: "streaming";
      step: "research" | "tailor";
      jobTitle?: string;
      company?: string;
      hasJobUrl: boolean;
      searches: string[];
      bullets: number;
    }
  | { phase: "preview" }
  | { phase: "exporting"; kind: "pdf" | "docx" }
  | { phase: "error"; message: string };

export default function ResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [resumeStatus, setResumeStatus] = useState<{
    filename: string | null;
    chars: number | null;
    uploading: boolean;
    error: string | null;
  }>({ filename: null, chars: null, uploading: false, error: null });

  const [jobUrl, setJobUrl] = useState("");
  const [highlights, setHighlights] = useState("");
  const [pageCount, setPageCount] = useState<1 | 2>(1);

  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [showRegen, setShowRegen] = useState(false);
  const [regenNotes, setRegenNotes] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const p = j.profile as Profile | null;
        setProfile(p);
        if (p?.resume_filename) {
          setResumeStatus({
            filename: p.resume_filename,
            chars: p.resume_text?.length ?? null,
            uploading: false,
            error: null,
          });
        }
      })
      .finally(() => setLoadingProfile(false));
  }, []);

  async function handleResume(file: File) {
    setResumeStatus({ filename: null, chars: null, uploading: true, error: null });
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/profile/resume", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) {
      setResumeStatus({
        filename: null,
        chars: null,
        uploading: false,
        error: j.error ?? "upload failed",
      });
    } else {
      setResumeStatus({
        filename: j.filename,
        chars: j.characters,
        uploading: false,
        error: null,
      });
      setProfile((p) =>
        p ? { ...p, resume_filename: j.filename, resume_text: "x".repeat(j.characters) } : p
      );
    }
  }

  async function runTailor(regenerate_notes?: string) {
    const trimmedUrlNow = jobUrl.trim();
    const hasJobUrl = trimmedUrlNow.length > 0;
    setStatus({
      phase: "streaming",
      step: "research",
      hasJobUrl,
      searches: [],
      bullets: 0,
    });
    setTailored((prev) => (regenerate_notes ? prev : null));

    const resp = await fetch("/api/resume/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_url: trimmedUrlNow || undefined,
        highlights: highlights.trim() || undefined,
        page_count: pageCount,
        regenerate_notes,
      }),
    });

    if (!resp.ok || !resp.body) {
      const j = await resp.json().catch(() => ({ error: "request failed" }));
      setStatus({ phase: "error", message: j.error ?? "request failed" });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as ResumeTailorStepEvent;
          handleEvent(evt);
        } catch {
          // ignore malformed line
        }
      }
    }
  }

  function handleEvent(evt: ResumeTailorStepEvent) {
    if (evt.type === "step" && evt.id === "research" && evt.status === "start") {
      setStatus((prev) => ({
        phase: "streaming",
        step: "research",
        hasJobUrl: prev.phase === "streaming" ? prev.hasJobUrl : jobUrl.trim().length > 0,
        searches: prev.phase === "streaming" ? prev.searches : [],
        bullets: 0,
      }));
    } else if (evt.type === "tool" && evt.name === "web_search") {
      setStatus((prev) =>
        prev.phase === "streaming"
          ? { ...prev, searches: [evt.query, ...prev.searches].slice(0, 3) }
          : prev
      );
    } else if (evt.type === "progress") {
      setStatus((prev) =>
        prev.phase === "streaming"
          ? { ...prev, step: "tailor", bullets: evt.bullets }
          : prev
      );
    } else if (evt.type === "step" && evt.id === "research" && evt.status === "done") {
      setStatus((prev) => ({
        phase: "streaming",
        step: "tailor",
        jobTitle: evt.data.job_title,
        company: evt.data.company,
        hasJobUrl: prev.phase === "streaming" ? prev.hasJobUrl : jobUrl.trim().length > 0,
        searches: prev.phase === "streaming" ? prev.searches : [],
        bullets: prev.phase === "streaming" ? prev.bullets : 0,
      }));
    } else if (evt.type === "step" && evt.id === "tailor" && evt.status === "done") {
      setTailored(evt.data.resume);
      setStatus({ phase: "preview" });
      setShowRegen(false);
      setRegenNotes("");
    } else if (evt.type === "error") {
      setStatus({ phase: "error", message: evt.message });
    }
  }

  async function download(kind: "pdf" | "docx") {
    if (!tailored) return;
    setStatus({ phase: "exporting", kind });
    try {
      const resp = await fetch(`/api/resume/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: tailored }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setStatus({ phase: "error", message: j.error ?? `${kind} failed` });
        return;
      }
      const bytes = await resp.arrayBuffer();
      const disp = resp.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `resume.${kind}`;
      // Force iOS Safari to treat the response as an opaque download instead
      // of inline-rendering it as a PDF.
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus({ phase: "preview" });
    } catch (e) {
      setStatus({ phase: "error", message: String(e) });
    }
  }

  const hasResume = !!resumeStatus.filename;
  const trimmedUrl = jobUrl.trim();
  const trimmedHighlights = highlights.trim();
  const urlOk = trimmedUrl === "" || /^https?:\/\//i.test(trimmedUrl);
  const hasBrief = trimmedUrl.length > 0 || trimmedHighlights.length > 0;
  const canRun = hasResume && hasBrief && urlOk && status.phase !== "streaming";

  if (loadingProfile) {
    return <div className="text-sm text-[color:var(--color-ink-muted)]">Loading…</div>;
  }

  if (!hasResume && !profile?.resume_text) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl" style={{ fontFamily: "var(--font-newsreader)" }}>
          Tailor a resume for a role
        </h1>
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          Upload a resume in onboarding first so Crew has something to tailor.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex rounded-md bg-[color:var(--color-clay)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-clay-dark)]"
        >
          Go to onboarding →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-[color:var(--color-clay)]">
          Resume · agent
        </div>
        <h1 className="text-3xl" style={{ fontFamily: "var(--font-newsreader)" }}>
          Tailor your resume to one job.
        </h1>
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          Crew reads the job posting, rewrites the bullets that matter, and previews a fresh draft.
          You approve the PDF or take the Word version to finish by hand.
        </p>
      </header>

      <Card title="Your resume on file">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            {resumeStatus.uploading ? (
              "Parsing…"
            ) : hasResume ? (
              <>
                <span className="text-[color:var(--color-clay)]">✓</span>{" "}
                <span className="font-medium">{resumeStatus.filename}</span>{" "}
                <span className="text-[color:var(--color-ink-muted)] text-xs">
                  ({resumeStatus.chars?.toLocaleString()} chars extracted)
                </span>
              </>
            ) : (
              <span className="text-[color:var(--color-ink-muted)]">No resume on file.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs rounded-md border border-[color:var(--color-line)] px-3 py-1.5 hover:border-[color:var(--color-clay)]"
          >
            {hasResume ? "Replace…" : "Upload…"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleResume(f);
            }}
          />
        </div>
        {resumeStatus.error && (
          <div className="mt-2 text-xs text-red-700">{resumeStatus.error}</div>
        )}
        <p className="mt-2 text-[11px] text-[color:var(--color-ink-muted)]">
          Replacing here also updates the resume Crew uses for outreach drafts.
        </p>
      </Card>

      <Card title="The brief">
        <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
          Give Crew at least one of these — a job posting to tailor to, or a description of how to
          change the resume. Both is best.
        </p>

        <label className="block text-xs text-[color:var(--color-ink-muted)] mb-1">
          Job posting URL
        </label>
        <input
          type="url"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://jobs.example.com/posting/123"
          className="w-full rounded-md border border-[color:var(--color-line)] bg-white/60 px-3 py-2 text-sm outline-none focus:border-[color:var(--color-clay)]"
        />

        <label className="block text-xs text-[color:var(--color-ink-muted)] mt-3 mb-1">
          What to change / emphasize
        </label>
        <textarea
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
          placeholder="e.g. 'lead with the Stripe work, show python + infra signal, mention shipping the billing migration'. Required if you didn't give a job URL."
          className="w-full min-h-[100px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm outline-none focus:border-[color:var(--color-clay)]"
        />

        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-[color:var(--color-ink-muted)]">Length</span>
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPageCount(n)}
              className={`rounded-full px-3 py-1 text-sm border ${
                pageCount === n
                  ? "bg-[color:var(--color-clay)] text-white border-[color:var(--color-clay)]"
                  : "border-[color:var(--color-line)] text-[color:var(--color-ink)] hover:border-[color:var(--color-clay)]"
              }`}
            >
              {n} page{n > 1 ? "s" : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => runTailor()}
            disabled={!canRun}
            className="rounded-md bg-[color:var(--color-clay)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-clay-dark)] disabled:opacity-50"
          >
            {status.phase === "streaming" ? "Tailoring…" : "Tailor my resume →"}
          </button>
          {!hasResume ? (
            <span className="text-xs text-[color:var(--color-ink-muted)]">
              Upload a resume first.
            </span>
          ) : !hasBrief ? (
            <span className="text-xs text-[color:var(--color-ink-muted)]">
              Add a job URL or a description.
            </span>
          ) : !urlOk ? (
            <span className="text-xs text-red-700">URL must start with http(s)://</span>
          ) : null}
        </div>
      </Card>

      {status.phase === "streaming" && (
        <Timeline
          step={status.step}
          jobTitle={status.jobTitle}
          company={status.company}
          hasJobUrl={status.hasJobUrl}
          searches={status.searches}
          bullets={status.bullets}
        />
      )}

      {status.phase === "error" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {status.message}
        </div>
      )}

      {tailored && status.phase !== "streaming" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-[color:var(--color-ink-muted)]">
              Preview · {tailored.meta.target_role || "tailored"} {tailored.meta.target_company ? `@ ${tailored.meta.target_company}` : ""}
            </div>
            <div className="text-[11px] text-[color:var(--color-ink-muted)]">
              {tailored.meta.page_count} page target · model {tailored.meta.model}
            </div>
          </div>

          <ResumePreview resume={tailored} />

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => download("pdf")}
              disabled={status.phase === "exporting"}
              className="rounded-md bg-[color:var(--color-clay)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-clay-dark)] disabled:opacity-50"
            >
              {status.phase === "exporting" && status.kind === "pdf"
                ? "Generating PDF…"
                : "Looks good — download PDF"}
            </button>

            <button
              type="button"
              onClick={() => setShowRegen((v) => !v)}
              className="rounded-md border border-[color:var(--color-line)] px-4 py-2 text-sm hover:border-[color:var(--color-clay)]"
            >
              {showRegen ? "Cancel" : "Regenerate with notes"}
            </button>

            <button
              type="button"
              onClick={() => download("docx")}
              disabled={status.phase === "exporting"}
              className="text-xs text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] underline disabled:opacity-50"
            >
              {status.phase === "exporting" && status.kind === "docx"
                ? "Generating .docx…"
                : "or download .docx to edit yourself"}
            </button>
          </div>

          {showRegen && (
            <div className="rounded-md border border-[color:var(--color-line)] bg-white/40 p-3 space-y-2">
              <textarea
                value={regenNotes}
                onChange={(e) => setRegenNotes(e.target.value)}
                placeholder="What's off? e.g. 'lead with infra, drop the consulting bullets, mention Postgres specifically'."
                className="w-full min-h-[80px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-2 text-sm outline-none focus:border-[color:var(--color-clay)]"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => runTailor(regenNotes.trim() || undefined)}
                  disabled={!regenNotes.trim()}
                  className="rounded-md bg-[color:var(--color-clay)] px-3 py-1.5 text-xs text-white hover:bg-[color:var(--color-clay-dark)] disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[color:var(--color-line)] bg-white/40 p-5">
      <h2 className="text-lg mb-3" style={{ fontFamily: "var(--font-newsreader)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Timeline({
  step,
  jobTitle,
  company,
  hasJobUrl,
  searches,
  bullets,
}: {
  step: "research" | "tailor";
  jobTitle?: string;
  company?: string;
  hasJobUrl: boolean;
  searches: string[];
  bullets: number;
}) {
  const firstStepLabel = hasJobUrl ? "Reading the job posting" : "Reading your brief";
  const target =
    step === "tailor" && (jobTitle || company)
      ? `${jobTitle ?? ""}${company ? ` @ ${company}` : ""}`.trim()
      : null;
  return (
    <div className="rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] px-4 py-3 text-sm space-y-2">
      <Row done={step === "tailor"} active={step === "research"} label={firstStepLabel}>
        {searches.length > 0 ? (
          <div className="space-y-0.5">
            {target ? <div>{target}</div> : null}
            {searches.map((q, i) => (
              <div key={`${q}-${i}`} className="truncate">
                Searching: <span className="italic">&ldquo;{q}&rdquo;</span>
              </div>
            ))}
          </div>
        ) : (
          target
        )}
      </Row>
      <Row done={false} active={step === "tailor"} label="Rewriting your resume">
        {step === "tailor"
          ? bullets > 0
            ? `Drafting bullets… ${bullets} written`
            : "Drafting bullets…"
          : null}
      </Row>
    </div>
  );
}

function Row({
  done,
  active,
  label,
  children,
}: {
  done: boolean;
  active: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-1 inline-block h-2 w-2 rounded-full ${
          done
            ? "bg-[color:var(--color-clay)]"
            : active
              ? "bg-[color:var(--color-clay)] animate-pulse"
              : "bg-[color:var(--color-line)]"
        }`}
      />
      <div className="flex-1">
        <div className={done || active ? "" : "text-[color:var(--color-ink-muted)]"}>{label}</div>
        {children ? (
          <div className="text-xs text-[color:var(--color-ink-muted)] mt-0.5">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
