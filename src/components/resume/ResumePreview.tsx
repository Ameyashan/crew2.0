"use client";

import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

export function ResumePreview({ resume }: { resume: TailoredResume }) {
  const h = resume.header;
  return (
    <article className="resume-preview bg-white text-[#1a1a1a] shadow-sm border border-[color:var(--color-line)] rounded-md px-10 py-9 text-[13px] leading-[1.45]">
      <header>
        <h1 className="text-[24px] font-semibold tracking-tight">{h.full_name || "—"}</h1>
        {h.headline ? <div className="text-[14px] text-[#444] mt-0.5">{h.headline}</div> : null}
        <div className="text-[11px] text-[#666] mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {h.location && <span>{h.location}</span>}
          {h.email && <a className="hover:underline" href={`mailto:${h.email}`}>{h.email}</a>}
          {h.phone && <span>{h.phone}</span>}
          {h.links?.linkedin && (
            <a className="hover:underline" href={h.links.linkedin} target="_blank" rel="noreferrer">
              {h.links.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {h.links?.github && (
            <a className="hover:underline" href={h.links.github} target="_blank" rel="noreferrer">
              {h.links.github.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {h.links?.website && (
            <a className="hover:underline" href={h.links.website} target="_blank" rel="noreferrer">
              {h.links.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
        </div>
      </header>

      {resume.summary ? (
        <Section title="Summary">
          <p>{resume.summary}</p>
        </Section>
      ) : null}

      {resume.experience.length ? (
        <Section title="Experience">
          <div className="space-y-3">
            {resume.experience.map((e, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <div className="font-semibold">{e.role}</div>
                  <div className="text-[11px] text-[#666]">{[e.start, e.end].filter(Boolean).join(" – ")}</div>
                </div>
                <div className="text-[12px] text-[#333]">{[e.company, e.location].filter(Boolean).join(", ")}</div>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.projects?.length ? (
        <Section title="Projects">
          <div className="space-y-3">
            {resume.projects.map((p, i) => (
              <div key={i}>
                <div className="font-semibold">
                  {p.link ? (
                    <a className="hover:underline" href={p.link} target="_blank" rel="noreferrer">{p.name}</a>
                  ) : p.name}
                </div>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  {p.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.education.length ? (
        <Section title="Education">
          <div className="space-y-2">
            {resume.education.map((e, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <div className="font-semibold">{e.school}</div>
                  <div className="text-[11px] text-[#666]">{[e.start, e.end].filter(Boolean).join(" – ")}</div>
                </div>
                <div className="text-[12px] text-[#333]">{[e.degree, e.field].filter(Boolean).join(", ")}</div>
                {e.notes?.length ? (
                  <ul className="mt-1 ml-4 list-disc space-y-0.5">
                    {e.notes.map((n, j) => <li key={j}>{n}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.skills?.length ? (
        <Section title="Skills">
          <div className="space-y-1">
            {resume.skills.map((s, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-28 shrink-0 font-semibold">{s.group}</div>
                <div className="flex-1">{s.items.join(", ")}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.extras?.map((x, i) => (
        <Section key={i} title={x.heading}>
          <ul className="ml-4 list-disc space-y-0.5">
            {x.items.map((it, j) => <li key={j}>{it}</li>)}
          </ul>
        </Section>
      ))}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-[10.5px] font-semibold tracking-[0.14em] uppercase border-b border-[#bbb] pb-1 mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}
