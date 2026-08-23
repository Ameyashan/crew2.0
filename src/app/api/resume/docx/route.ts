import { NextRequest } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TabStopType,
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
// half-points (10pt = 20). The numbers below mirror ResumeDoc.tsx exactly so the
// PDF and the .docx are the same document in two formats.
const PT = 20;
const MARGIN_X = 34 * PT; // 680 — matches the PDF's 34pt side margins
const TEXT_WIDTH = 12240 - MARGIN_X * 2; // letter width (8.5in) less both margins
const TAB_CENTER = Math.round(TEXT_WIDTH / 2);
const TAB_RIGHT = TEXT_WIDTH;

const BODY = 20; // 10pt
const ROLE = 22; // 11pt
const NAME = 52; // 26pt
const CONTACT = 17; // 8.5pt
const SUMMARY = 21; // 10.5pt

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
        companyRow(
          e.role,
          [e.company, e.location].filter(Boolean).join(", "),
          dateRange(e.start, e.end)
        )
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
          tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
          children: [
            new TextRun({ text: e.school, bold: true, size: BODY }),
            new TextRun({ text: `\t${dateRange(e.start, e.end)}`, size: BODY }),
          ],
          spacing: { before: 120 },
        })
      );
      const degree = [e.degree, e.field].filter(Boolean).join(", ");
      if (degree || e.gpa) {
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
            children: [
              new TextRun({ text: degree, size: BODY }),
              ...(e.gpa
                ? [new TextRun({ text: `\tGPA: ${e.gpa}`, italics: true, size: BODY })]
                : []),
            ],
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

// Title on the left, employer centered, dates right — one line, two tab stops.
function companyRow(role: string, company: string, dates: string): Paragraph {
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: TAB_CENTER },
      { type: TabStopType.RIGHT, position: TAB_RIGHT },
    ],
    children: [
      new TextRun({ text: role, bold: true, size: ROLE }),
      new TextRun({ text: `\t${company}`, bold: true, size: ROLE }),
      new TextRun({ text: `\t${dates}`, italics: true, size: ROLE }),
    ],
    spacing: { before: 140 },
  });
}

function trackLine(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: richRuns(text, BODY, true),
    spacing: { before: 60, after: 20 },
  });
}

function trackBlock(t: ResumeTrack): Paragraph[] {
  const line = [t.title, t.context].filter(Boolean).join(" | ");
  const out: Paragraph[] = [];
  if (line) out.push(trackLine(line));
  for (const b of t.bullets) out.push(bullet(b));
  return out;
}

function extraRoleBlock(role: ExtraRole): Paragraph[] {
  const out: Paragraph[] = [
    companyRow(
      role.role,
      [role.org, role.location].filter(Boolean).join(", "),
      dateRange(role.start, role.end)
    ),
  ];
  if (role.context) out.push(trackLine(role.context));
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
