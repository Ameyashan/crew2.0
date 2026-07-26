// Fit a tailored resume to its target page count by MEASURING the real rendered
// PDF and trimming the lowest-priority content until it genuinely fits.
//
// Why this exists: the model treats `page_count` as a soft cap, and the PDF
// renderer (@react-pdf/renderer) paginates freely — so a resume the model
// intended as one page could still spill onto a second physical page on
// download, while the preview label ("1 page", read straight off meta.page_count)
// kept claiming one. This renders the SAME <ResumeDoc> the /api/resume/pdf route
// uses, counts pages with pdf.js (via unpdf), trims one unit at a time, and
// re-measures — so the label, the PDF, and the DOCX all agree on reality.
//
// Trimming honors the resume HARD RULES: it never drops a whole job or degree and
// never leaves an experience role with zero bullets. It trims from the least
// costly content first (extras → projects → education notes → skills →
// oldest-role bullets → summary).

import { renderToBuffer } from "@react-pdf/renderer";
import { ResumeDoc } from "@/components/resume/ResumeDoc";
import type { TailoredResume } from "./types";

// One removed fragment, so the caller can record an honest "dropped" changelog.
export interface DroppedUnit {
  section: string;
  removed: string;
}

async function countPdfPages(resume: TailoredResume): Promise<number> {
  const buf = await renderToBuffer(<ResumeDoc resume={resume} />);
  // unpdf bundles pdf.js and is a Node-external package (see next.config.ts), so
  // import it dynamically like the resume-upload path does.
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  return pdf.numPages;
}

// Remove exactly ONE unit of content, cheapest-to-lose first. Returns the removed
// fragment (for the changelog) or null when nothing can be trimmed without
// breaking a hard rule.
function trimOneUnit(r: TailoredResume): DroppedUnit | null {
  // 1) Extras (awards / misc) — the least load-bearing section.
  if (r.extras?.length) {
    for (let i = r.extras.length - 1; i >= 0; i--) {
      const g = r.extras[i];
      if (g.items.length) {
        const removed = g.items.pop()!;
        if (!g.items.length) r.extras.splice(i, 1);
        return { section: g.heading || "Extras", removed };
      }
    }
    const g = r.extras.pop()!;
    return { section: g.heading || "Extras", removed: g.heading || "extra" };
  }

  // 2) Projects — secondary to real jobs. Trim the last project's last bullet;
  //    drop a project once it has no bullets left.
  if (r.projects?.length) {
    for (let i = r.projects.length - 1; i >= 0; i--) {
      const p = r.projects[i];
      if (p.bullets.length) {
        const removed = p.bullets.pop()!;
        if (!p.bullets.length) r.projects.splice(i, 1);
        return { section: `Projects · ${p.name}`, removed };
      }
    }
    const p = r.projects.pop()!;
    return { section: "Projects", removed: p.name || "project" };
  }

  // 3) Education notes — never the entry itself, just its supporting notes.
  for (let i = r.education.length - 1; i >= 0; i--) {
    const e = r.education[i];
    if (e.notes?.length) {
      const removed = e.notes.pop()!;
      return { section: `Education · ${e.school}`, removed };
    }
  }

  // 4) Skills — trim overflow keywords, but never strip a group to nothing.
  if (r.skills?.length) {
    for (let i = r.skills.length - 1; i >= 0; i--) {
      const s = r.skills[i];
      if (s.items.length > 1) {
        const removed = s.items.pop()!;
        return { section: `Skills · ${s.group}`, removed };
      }
    }
  }

  // 5) Experience bullets — the last resort before touching the summary. Trim the
  //    LAST role that still has more than one bullet (reverse-chronological, so
  //    that's the oldest); never leave a role with zero bullets, never drop a role.
  for (let i = r.experience.length - 1; i >= 0; i--) {
    const e = r.experience[i];
    if (e.bullets.length > 1) {
      const removed = e.bullets.pop()!;
      return { section: `Experience · ${e.company}`, removed };
    }
  }

  // 6) Summary — drop it whole only when nothing else is left to give.
  if (r.summary) {
    const removed = r.summary;
    r.summary = undefined;
    return { section: "Summary", removed };
  }

  return null;
}

export interface FitResult {
  resume: TailoredResume;
  pageCount: number;
  dropped: DroppedUnit[];
}

// Render → measure → trim → re-measure until the resume fits `target` pages (or
// nothing more can be safely trimmed). Returns a NEW resume (the input is left
// untouched) with meta.page_count stamped to the REAL measured page count.
export async function fitResumeToPageCount(
  resume: TailoredResume,
  target: number,
): Promise<FitResult> {
  const maxPages = target === 2 ? 2 : 1;
  const working: TailoredResume = structuredClone(resume);
  const dropped: DroppedUnit[] = [];

  let pages = await countPdfPages(working);
  // A generous bound: a resume has far fewer than 40 trimmable units, and the
  // loop also exits the moment it fits or there's nothing left to cut.
  for (let i = 0; i < 40 && pages > maxPages; i++) {
    const unit = trimOneUnit(working);
    if (!unit) break; // can't trim further without breaking a hard rule
    dropped.push(unit);
    pages = await countPdfPages(working);
  }

  // Stamp the honest, measured page count (clamped to the 1|2 the type allows).
  working.meta.page_count = (pages >= 2 ? 2 : 1) as 1 | 2;
  return { resume: working, pageCount: pages, dropped };
}
