"use client";

import { useEffect, useRef, useState } from "react";
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


export default function SettingsPage() {
  const [loaded, setLoaded] = useState(false);
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
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const p = j.profile as Profile | null;
        if (p) {
          setFullName(p.full_name ?? "");
          setLinkedin(p.linkedin_url ?? "");
          setSamples(p.writing_samples ?? "");
          setContextPrompt(p.context_prompt ?? "");
          if (p.followup_days != null) setCadence(p.followup_days as FollowupChoice);
          else if (p.onboarded_at) setCadence("never");
          if (p.resume_filename) {
            setResumeStatus({
              filename: p.resume_filename,
              chars: p.resume_text?.length ?? null,
              error: null,
              uploading: false,
            });
          }
        }
        setLoaded(true);
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

  async function save() {
    setSaving(true);
    setSaved(false);
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
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const hasResume = !!resumeStatus.filename;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-clay)] mb-3">
          Reach Out · Settings
        </div>
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-newsreader)" }}>
          Your context
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-muted)]">
          Crew uses these to write drafts in your voice. Update them any time — changes apply to
          all future drafts.
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-[color:var(--color-ink-muted)]">Loading…</p>
      ) : (
        <div className="space-y-5">
          <Section title="Resume" hint="PDF or DOCX. Used as background context.">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleResume(f);
              }}
              className="rounded-lg border border-dashed border-[color:var(--color-line)] px-4 py-5 text-center text-sm text-[color:var(--color-ink-muted)] cursor-pointer hover:bg-[color:var(--color-cream-50)]"
            >
              {resumeStatus.uploading ? (
                "Parsing…"
              ) : hasResume ? (
                <span>
                  <span className="text-[color:var(--color-clay)]">✓</span>{" "}
                  <span className="text-[color:var(--color-ink)]">{resumeStatus.filename}</span>{" "}
                  <span className="text-xs">({resumeStatus.chars} chars)</span>
                  <div className="mt-1 text-[11px]">Click or drop to replace</div>
                </span>
              ) : (
                <>
                  ↑ Drop a file or click to upload
                  <div className="mt-1 text-[11px]">PDF, DOCX, TXT · max 5MB</div>
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
            <label className="mt-3 block">
              <div className="text-xs text-[color:var(--color-ink-muted)] mb-1">
                Full name (used in sign-offs)
              </div>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-[color:var(--color-line)] bg-white/60 px-3 py-2 text-sm outline-none focus:border-[color:var(--color-clay)]"
              />
            </label>
          </Section>

          <Section title="LinkedIn profile" hint="Used as context, never to message anyone.">
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
          </Section>

          <Section
            title="Voice samples"
            hint="Paste real emails or DMs you've written so drafts match your tone."
          >
            <textarea
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
              placeholder="Paste a real email or DM. We learn the patterns, not the content."
              className="w-full min-h-[160px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm outline-none focus:border-[color:var(--color-clay)] font-mono"
            />
          </Section>

          <Section
            title="Goals & context (optional)"
            hint="Paste a self-summary from your favorite LLM. Crew uses it to draft messages that reflect what you're working toward."
          >
            <div className="rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] p-3 text-xs text-[color:var(--color-ink-muted)]">
              <div className="mb-2">
                1. Copy this prompt into Claude or ChatGPT and answer its questions.
                2. Paste the final summary below.
              </div>
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
              className="mt-3 w-full min-h-[160px] rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 text-sm outline-none focus:border-[color:var(--color-clay)]"
            />
          </Section>

          <Section title="Followup cadence" hint="When someone doesn't reply, when should Crew nudge?">
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
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-[color:var(--color-clay)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-clay-dark)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <span className="text-xs text-[color:var(--color-clay)]">✓ saved</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--color-line)] bg-white/40 p-5">
      <h2 className="text-lg" style={{ fontFamily: "var(--font-newsreader)" }}>
        {title}
      </h2>
      {hint && (
        <p className="mt-1 mb-3 text-xs text-[color:var(--color-ink-muted)]">{hint}</p>
      )}
      {children}
    </section>
  );
}
