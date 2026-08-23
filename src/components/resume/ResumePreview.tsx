"use client";

import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { parseInlineBold } from "@/lib/writing/inline-markup";

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
          <p><Rich>{resume.summary}</Rich></p>
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
                {/* A multi-stint employer keeps its bullets inside tracks, not on
                    the entry — without this branch the role would render empty. */}
                {e.tracks?.length
                  ? e.tracks.map((t, j) => (
                      <div key={j} className="mt-1.5">
                        <div className="flex justify-between items-baseline gap-3">
                          <div className="text-[12px] italic font-semibold">{t.title}</div>
                          <div className="text-[11px] text-[#666] shrink-0">
                            {[t.start, t.end].filter(Boolean).join(" – ")}
                          </div>
                        </div>
                        {t.context ? (
                          <div className="text-[12px] italic text-[#444]"><Rich>{t.context}</Rich></div>
                        ) : null}
                        <Bullets items={t.bullets}/>
                      </div>
                    ))
                  : <Bullets items={e.bullets}/>}
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
                <Bullets items={p.bullets}/>
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
                {e.gpa ? <div className="text-[12px] text-[#333] italic">GPA: {e.gpa}</div> : null}
                {e.coursework ? (
                  <div className="text-[12px] text-[#333]"><span className="font-semibold">Coursework</span>: {e.coursework}</div>
                ) : null}
                <Bullets items={e.notes}/>
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
          {x.roles?.length ? (
            <div className="space-y-3">
              {x.roles.map((r, j) => (
                <div key={j}>
                  <div className="flex justify-between items-baseline">
                    <div className="font-semibold">{r.role}</div>
                    <div className="text-[11px] text-[#666]">{[r.start, r.end].filter(Boolean).join(" – ")}</div>
                  </div>
                  <div className="text-[12px] text-[#333]">{[r.org, r.location].filter(Boolean).join(", ")}</div>
                  {r.context ? (
                    <div className="text-[12px] italic text-[#444] mt-0.5"><Rich>{r.context}</Rich></div>
                  ) : null}
                  <Bullets items={r.bullets}/>
                </div>
              ))}
            </div>
          ) : (
            <Bullets items={x.items}/>
          )}
        </Section>
      ))}
    </article>
  );
}

// Resume copy marks its highest-signal phrase with **bold**; render it as such.
function Rich({ children }: { children: string }) {
  return (
    <>
      {parseInlineBold(children).map((s, i) =>
        s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>
      )}
    </>
  );
}

function Bullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1 ml-4 list-disc space-y-0.5">
      {items.map((b, j) => (
        <li key={j}><Rich>{b}</Rich></li>
      ))}
    </ul>
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
