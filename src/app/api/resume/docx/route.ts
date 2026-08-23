import { NextRequest } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ExternalHyperlink,
  type ParagraphChild,
} from "docx";
import type {
  TailoredResume,
  ResumeTrack,
  ExtraRole,
} from "@/lib/agents/resume-tailor/types";
import { parseInlineBold } from "@/lib/writing/inline-markup";

import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Word measures paragraph geometry in twips (1pt = 20) and run sizes in
// half-points (10pt = 20). Sizes and margins mirror ResumeDoc.tsx.
//
// Role headers here are TWO LINES and use no tab stops, which is the one place
// this file deliberately diverges from the PDF. A PDF is fixed layout, so the
// PDF's three-column role row is safe; a .docx reflows, and right-aligned dates
// set with a right tab stop collapse when the file is opened in Google Docs —
// the date slams into the title and the header reads as one mashed line. Plenty
// of recruiters open .docx in Google Docs, so the header is split into a bold
// employer-and-title line and a grey location-and-date line beneath it. No tabs,
// no tables, and each fact gets an obvious place.
const PT = 20;
const MARGIN_X = 34 * PT; // 680 — matches the PDF's 34pt side margins

const BODY = 20; // 10pt
const ROLE = 22; // 11pt
const NAME = 52; // 26pt
const CONTACT = 17; // 8.5pt
const SUMMARY = 21; // 10.5pt
const META_GREY = "555555";
const DOT = "  \u00B7  ";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const resume = body?.resume as TailoredResume | undefined;
  if (!resume?.header?.full_name) {
    return Response.json({ error: "resume payload required" }, { status: 400 });
  }

  const doc = buildDoc(resume);
  const buf = await Packer.toBuffer(doc);
  const filename = filenameFor(resume, "docx");

  // Product-analytics: a resume export is a key activation signal.
  // These routes are unauthenticated (see the security follow-up to gate
  // them), so the event records with a null owner.
  void trackServer("resume_export", { format: "docx" });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Split `**bold**` markup into Word runs. Shared by every piece of body copy.
function richRuns(text: string, size = BODY, italics = false): TextRun[] {
  return parseInlineBold(text).map(
    (s) => new TextRun({ text: s.text, bold: s.bold, italics, size })
  );
}

function dateRange(start?: string, end?: string) {
  return [start, end].filter(Boolean).join(" – ");
}

function buildDoc(r: TailoredResume): Document {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: r.header.full_name, bold: true, size: NAME })],
      spacing: { after: 20 },
    })
  );
  if (r.header.headline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: richRuns(r.header.headline, SUMMARY, true),
        spacing: { after: 20 },
      })
    );
  }

  const contact = contactRuns(r);
  if (contact.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: contact,
        spacing: { after: 60 },
      })
    );
  }

  if (r.summary) {
    children.push(sectionTitle("Summary"));
    children.push(
      new Paragraph({
        children: richRuns(r.summary, SUMMARY),
        spacing: { after: 60, line: 264, lineRule: "auto" },
      })
    );
  }

  if (r.experience.length) {
    children.push(sectionTitle("Experience"));
    for (const e of r.experience) {
      children.push(
        ...companyRow(e.role, e.company, dateRange(e.start, e.end), e.location)
      );
      if (e.tracks?.length) {
        for (const t of e.tracks) children.push(...trackBlock(t));
      } else {
        for (const b of e.bullets) children.push(bullet(b));
      }
    }
  }

  for (const x of r.extras ?? []) {
    children.push(sectionTitle(x.heading));
    if (x.roles?.length) {
      for (const role of x.roles) children.push(...extraRoleBlock(role));
    } else {
      for (const it of x.items) children.push(bullet(it));
    }
  }

  // Projects and Skills are no longer produced by default; saved resumes from
  // before this template still carry them, so both stay renderable.
  if (r.projects?.length) {
    children.push(sectionTitle("Projects"));
    for (const p of r.projects) {
      children.push(
        new Paragraph({
          children: [
            p.link
              ? new ExternalHyperlink({
                  link: p.link,
                  children: [
                    new TextRun({ text: p.name, bold: true, size: ROLE, underline: {} }),
                  ],
                })
              : new TextRun({ text: p.name, bold: true, size: ROLE }),
          ],
          spacing: { before: 140 },
        })
      );
      for (const b of p.bullets) children.push(bullet(b));
    }
  }

  if (r.education.length) {
    children.push(sectionTitle("Education"));
    for (const e of r.education) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: e.school, bold: true, size: BODY })],
          spacing: { before: 120 },
        })
      );
      const degree = [e.degree, e.field].filter(Boolean).join(", ");
      const eduMeta = [degree, e.gpa ? `GPA: ${e.gpa}` : null, dateRange(e.start, e.end)]
        .filter(Boolean)
        .join(DOT);
      if (eduMeta) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: eduMeta, italics: true, size: BODY, color: META_GREY })],
            spacing: { after: 20 },
          })
        );
      }
      if (e.coursework) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Coursework", bold: true, size: BODY }),
              new TextRun({ text: `: ${e.coursework}`, size: BODY }),
            ],
            spacing: { after: 20 },
          })
        );
      }
      for (const n of e.notes ?? []) children.push(bullet(n));
    }
  }

  if (r.skills?.length) {
    children.push(sectionTitle("Skills"));
    for (const s of r.skills) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${s.group}: `, bold: true, size: BODY }),
            new TextRun({ text: s.items.join(", "), size: BODY }),
          ],
          spacing: { after: 20 },
        })
      );
    }
  }

  return new Document({
    // One place to set the typeface, so every run above inherits Times.
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: BODY } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 40 * PT, bottom: 36 * PT, left: MARGIN_X, right: MARGIN_X },
          },
        },
        children,
      },
    ],
  });
}

// Bold employer-and-title line, then a grey location-and-date line. See the note
// on the constants above for why this is two lines rather than a tabbed row.
function companyRow(role: string, company: string, dates: string, location?: string): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: [company, role].filter(Boolean).join(DOT),
          bold: true,
          size: ROLE,
        }),
      ],
      spacing: { before: 140 },
    }),
  ];
  const meta = [location, dates].filter(Boolean).join(DOT);
  if (meta) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: meta, italics: true, size: BODY, color: META_GREY })],
        spacing: { after: 20 },
      })
    );
  }
  return out;
}

// The scope line under a stint: what was owned, how big, who relied on it.
function contextLine(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: richRuns(text, BODY, true),
    spacing: { before: 40, after: 20 },
  });
}

function trackBlock(t: ResumeTrack): Paragraph[] {
  const out: Paragraph[] = [];
  const dates = dateRange(t.start, t.end);
  if (t.title || dates) {
    // Dates ride inline in parentheses rather than on a right tab stop, for the
    // Google Docs reason above.
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: t.title, italics: true, bold: true, size: BODY }),
          ...(dates
            ? [new TextRun({ text: `  (${dates})`, italics: true, size: BODY, color: META_GREY })]
            : []),
        ],
        spacing: { before: 100 },
      })
    );
  }
  if (t.context) out.push(contextLine(t.context));
  for (const b of t.bullets) out.push(bullet(b));
  return out;
}

function extraRoleBlock(role: ExtraRole): Paragraph[] {
  const out: Paragraph[] = companyRow(
    role.role,
    role.org ?? "",
    dateRange(role.start, role.end),
    role.location
  );
  if (role.context) out.push(contextLine(role.context));
  for (const b of role.bullets) out.push(bullet(b));
  return out;
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 60 },
    children: [
      // HEADING_2 carries Word's built-in blue; the résumé is set in black.
      new TextRun({ text: `${text.toUpperCase()}:`, bold: true, size: BODY, color: "000000" }),
    ],
    border: { bottom: { color: "000000", space: 2, style: "single", size: 8 } },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: richRuns(text),
    // line 240 = single spacing; the tight 11pt leading of the PDF.
    spacing: { after: 30, line: 240, lineRule: "auto" },
  });
}

function contactRuns(r: TailoredResume) {
  const out: ParagraphChild[] = [];
  const push = (run: ParagraphChild) => {
    if (out.length) out.push(new TextRun({ text: "  |  ", size: CONTACT }));
    out.push(run);
  };
  const h = r.header;
  if (h.location) push(new TextRun({ text: h.location, size: CONTACT }));
  if (h.email)
    push(
      new ExternalHyperlink({
        link: `mailto:${h.email}`,
        children: [new TextRun({ text: h.email, size: CONTACT })],
      })
    );
  if (h.phone) push(new TextRun({ text: h.phone, size: CONTACT }));
  const link = (url?: string) => {
    if (!url) return;
    push(
      new ExternalHyperlink({
        link: url,
        children: [
          new TextRun({
            text: url.replace(/^https?:\/\/(www\.)?/, ""),
            size: CONTACT,
            underline: {},
          }),
        ],
      })
    );
  };
  link(h.links?.linkedin);
  link(h.links?.github);
  link(h.links?.website);
  return out;
}

function filenameFor(r: TailoredResume, ext: "pdf" | "docx") {
  const name = (r.header.full_name || "resume")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const role = (r.meta.target_role || "")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return [name, role || null, "resume"].filter(Boolean).join("-").toLowerCase() + "." + ext;
}
