"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTEXT_PROMPT_TEMPLATE } from "@/lib/profile";

type FollowupChoice = 3 | 5 | 7 | 10 | "never";

interface Profile {
  full_name: string | null;
  linkedin_url: string | null;
  resume_text: string | null;
  resume_filename: string | null;
  writing_samples: string | null;
  followup_days: number | null;
  context_prompt: string | null;
  onboarded_at: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [samples, setSamples] = useState("");
  const [contextPrompt, setContextPrompt] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [cadence, setCadence] = useState<FollowupChoice>(5);
  const [resumeStatus, setResumeStatus] = useState<{
    filename: string | null;
    chars: number | null;
    error: string | null;
    uploading: boolean;
  }>({ filename: null, chars: null, error: null, uploading: false });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const p = j.profile as Profile | null;
        setProfile(p);
        if (p) {
          setFullName(p.full_name ?? "");
          setLinkedin(p.linkedin_url ?? "");
          setSamples(p.writing_samples ?? "");
          setContextPrompt(p.context_prompt ?? "");
          if (p.followup_days != null) {
            setCadence(p.followup_days as FollowupChoice);
          } else if (p.onboarded_at) {
            setCadence("never");
          }
          if (p.resume_filename) {
            setResumeStatus((s) => ({
              ...s,
              filename: p.resume_filename!,
              chars: p.resume_text?.length ?? null,
            }));
          }
        }
      });
  }, []);

  async function handleResume(file: File) {
    setResumeStatus({ filename: null, chars: null, error: null, uploading: true });
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/profile/resume", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) {
      setResumeStatus({ filename: null, chars: null, error: j.error ?? "upload failed", uploading: false });
    } else {
      setResumeStatus({ filename: j.filename, chars: j.characters, error: null, uploading: false });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName || null,
          linkedin_url: linkedin || null,
          writing_samples: samples || null,
          context_prompt: contextPrompt || null,
          followup_days: cadence === "never" ? null : Number(cadence),
          onboarded: true,
        }),
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  function skipAll() {
    fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followup_days: 5, onboarded: true }),
    }).then(() => router.push("/"));
  }

  const hasResume = !!resumeStatus.filename;
  const hasLinkedIn = !!linkedin;
  const hasSamples = !!samples.trim();
  const hasContext = !!contextPrompt.trim();

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <aside className="space-y-6">
        <div className="text-xs uppercase tracking-wide text-[color:var(--color-clay)]">
          Crew · let&apos;s get you set up
        </div>
        <h1
          className="text-4xl leading-tight"
          style={{ fontFamily: "var(--font-newsreader)" }}
        >
          Tell Crew about you.{" "}
          <em className="text-[color:var(--color-ink-muted)]">
            All of it is optional.
          </em>
        </h1>
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          More context means sharper drafts. You can skip every step except the
          followup default and still ship your first message in under a minute.
        </p>

        <div className="rounded-lg border border-[color:var(--color-line)] bg-white/40 p-4 space-y-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-muted)]">
            Context Crew will use
          </div>
          <Check label="Resume" set={hasResume} />
          <Check label="LinkedIn" set={hasLinkedIn} />
          <Check label="Voice samples" set={hasSamples} />
          <Check label="Goals & context" set={hasContext} />
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-2">
              <span className="text-[color:var(--color-clay)]">✓</span>
              Followup default ·{" "}
              {cadence === "never" ? "never" : `after ${cadence}d`}
            </span>
          </div>
        </div>
      </aside>

      <form onSubmit={save} className="space-y-4">
        <Card n={1} title="Drop your resume" required={false}>
          <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
            PDF or DOCX. Helps Crew describe you in your own words.
          </p>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleResume(f);
            }}
            className="rounded-lg border border-dashed border-[color:var(--color-line)] px-4 py-6 text-center text-sm text-[color:var(--color-ink-muted)] cursor-pointer hover:bg-[color:var(--color-cream-50)]"
          >
            {resumeStatus.uploading ? (
              "Parsing…"
            ) : hasResume ? (
              <span>
                <span className="text-[color:var(--color-clay)]">✓</span>{" "}
                {resumeStatus.filename}{" "}
                <span className="text-xs">({resumeStatus.chars} chars)</span>
              </span>
            ) : (
              <>
                ↑ Drop a file or click to upload a sample resume
                <div className="mt-1 text-[11px]">
                  PDF, DOCX, TXT · max 5MB · skip if you&apos;d rather not
                </div>
              </>
            )}
          </div>
          {resumeStatus.error && (
            <div className="mt-2 text-xs text-red-700">{resumeStatus.error}</div>
          )}
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
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name (used in sign-offs)"
            className="mt-3 w-full rounded-md border border-[color:var(--color-line)] bg-white/60 px-3 py-2 text-sm outline-none focus:border-[color:var(--color-clay)]"
          />
        </Card>

        <Card n={2} title="LinkedIn profile">
          <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
            Used for context, never to message anyone.
          </p>
          <div className="flex items-center rounded-md border border-[color:var(--color-line)] bg-white/60">
            <span className="pl-3 pr-1 text-xs text-[color:var(--color-ink-muted)] font-mono">
              linkedin.com/in/
            </span>
            <input
              value={linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")}
              onChange={(e) => {
                const v = e.target.value.trim();
                setLinkedin(v ? `https://www.linkedin.com/in/${v.replace(/^\/+/, "")}` : "");
              }}
              placeholder="your-handle"
              className="flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            />
          </div>
        </Card>

        <Card n={3} title="Writing samples">
          <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
            Paste 1–2 things you&apos;ve actually written so Crew matches your voice.
          </p>
          <textarea
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="Paste a real email or DM you've sent. We learn the patterns, not the content."
            className="w-full min-h-[140px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm outline-none focus:border-[color:var(--color-clay)] font-mono"
          />
        </Card>

        <Card n={4} title="Goals & context">
          <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
            Paste this prompt into your favorite LLM, answer its questions, then paste the
            summary back. Crew uses it to write drafts that match what you&apos;re working toward.
          </p>
          <div className="rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] p-3 text-xs text-[color:var(--color-ink-muted)]">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[color:var(--color-ink)]">
{CONTEXT_PROMPT_TEMPLATE}
            </pre>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(CONTEXT_PROMPT_TEMPLATE);
                setPromptCopied(true);
                setTimeout(() => setPromptCopied(false), 2000);
              }}
              className="mt-2 rounded-md border border-[color:var(--color-line)] bg-white/60 px-2 py-1 text-[11px] hover:border-[color:var(--color-clay)]"
            >
              {promptCopied ? "✓ copied" : "Copy prompt"}
            </button>
          </div>
          <textarea
            value={contextPrompt}
            onChange={(e) => setContextPrompt(e.target.value)}
            placeholder="Paste your LLM-generated summary here…"
            className="mt-3 w-full min-h-[140px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm outline-none focus:border-[color:var(--color-clay)]"
          />
        </Card>

        <Card n={5} title="Followup cadence" required>
          <p className="text-xs text-[color:var(--color-ink-muted)] mb-3">
            When someone doesn&apos;t reply, when should Crew nudge?
          </p>
          <div className="flex flex-wrap gap-2">
            {([3, 5, 7, 10, "never"] as FollowupChoice[]).map((opt) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => setCadence(opt)}
                className={`rounded-full px-3 py-1 text-sm border ${
                  cadence === opt
                    ? "bg-[color:var(--color-clay)] text-white border-[color:var(--color-clay)]"
                    : "border-[color:var(--color-line)] text-[color:var(--color-ink)] hover:border-[color:var(--color-clay)]"
                }`}
              >
                {opt === "never" ? "never" : `${opt}d`}
              </button>
            ))}
          </div>
        </Card>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[color:var(--color-clay)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-clay-dark)] disabled:opacity-50"
          >
            Take me to Crew →
          </button>
          {!profile?.onboarded_at && (
            <button
              type="button"
              onClick={skipAll}
              className="text-xs text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
            >
              skip everything
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Check({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-3 w-3 rounded-sm border ${
          set ? "bg-[color:var(--color-clay)] border-[color:var(--color-clay)]" : "border-[color:var(--color-line)]"
        }`}
      />
      <span className={set ? "" : "italic text-[color:var(--color-ink-muted)]"}>
        {label} {set ? "" : "— not added"}
      </span>
    </div>
  );
}

function Card({
  n,
  title,
  required,
  children,
}: {
  n: number;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--color-line)] bg-white/40 p-5">
      <header className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-line)] text-xs text-[color:var(--color-ink-muted)]">
            {n}
          </span>
          <h2
            className="text-lg"
            style={{ fontFamily: "var(--font-newsreader)" }}
          >
            {title}
          </h2>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider ${
            required
              ? "text-[color:var(--color-clay)]"
              : "text-[color:var(--color-ink-muted)]"
          }`}
        >
          {required ? "required" : "optional"}
        </span>
      </header>
      {children}
    </section>
  );
}
