import { NextRequest } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TabStopType,
  TabStopPosition,
  ExternalHyperlink,
} from "docx";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

import { trackServer } from "@/lib/analytics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

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

function buildDoc(r: TailoredResume): Document {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: r.header.full_name, bold: true, size: 36 })],
      spacing: { after: 40 },
    })
  );
  if (r.header.headline) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: r.header.headline, color: "444444", size: 22 })],
        spacing: { after: 60 },
      })
    );
  }

  const contact = contactRuns(r);
  if (contact.length) {
    children.push(
      new Paragraph({ children: contact, spacing: { after: 180 } })
    );
  }

  if (r.summary) {
    children.push(sectionTitle("Summary"));
    children.push(
      new Paragraph({ children: [new TextRun({ text: r.summary, size: 22 })], spacing: { after: 80 } })
    );
  }

  if (r.experience.length) {
    children.push(sectionTitle("Experience"));
    for (const e of r.experience) {
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: e.role, bold: true, size: 22 }),
            new TextRun({ text: `\t${[e.start, e.end].filter(Boolean).join(" – ")}`, size: 20, color: "666666" }),
          ],
          spacing: { before: 80 },
        })
      );
      const sub = [e.company, e.location].filter(Boolean).join(", ");
      if (sub) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: sub, italics: true, color: "333333", size: 22 })],
            spacing: { after: 40 },
          })
        );
      }
      for (const b of e.bullets) children.push(bullet(b));
    }
  }

  if (r.projects?.length) {
    children.push(sectionTitle("Projects"));
    for (const p of r.projects) {
      children.push(
        new Paragraph({
          children: [
            p.link
              ? new ExternalHyperlink({
                  link: p.link,
                  children: [new TextRun({ text: p.name, bold: true, size: 22, color: "0b5fff", underline: {} })],
                })
              : new TextRun({ text: p.name, bold: true, size: 22 }),
          ],
          spacing: { before: 80 },
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
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: e.school, bold: true, size: 22 }),
            new TextRun({ text: `\t${[e.start, e.end].filter(Boolean).join(" – ")}`, size: 20, color: "666666" }),
          ],
          spacing: { before: 80 },
        })
      );
      const sub = [e.degree, e.field].filter(Boolean).join(", ");
      if (sub) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: sub, italics: true, color: "333333", size: 22 })],
            spacing: { after: 40 },
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
            new TextRun({ text: `${s.group}: `, bold: true, size: 22 }),
            new TextRun({ text: s.items.join(", "), size: 22 }),
          ],
          spacing: { after: 40 },
        })
      );
    }
  }

  for (const x of r.extras ?? []) {
    children.push(sectionTitle(x.heading));
    for (const it of x.items) children.push(bullet(it));
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children,
      },
    ],
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, characterSpacing: 30 }),
    ],
    border: { bottom: { color: "999999", space: 2, style: "single", size: 6 } },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 40 },
  });
}

function contactRuns(r: TailoredResume) {
  const out: (TextRun | ExternalHyperlink)[] = [];
  const push = (run: TextRun | ExternalHyperlink) => {
    if (out.length) out.push(new TextRun({ text: "  ·  ", color: "999999", size: 20 }));
    out.push(run);
  };
  const h = r.header;
  if (h.location) push(new TextRun({ text: h.location, size: 20, color: "555555" }));
  if (h.email)
    push(
      new ExternalHyperlink({
        link: `mailto:${h.email}`,
        children: [new TextRun({ text: h.email, size: 20, color: "555555" })],
      })
    );
  if (h.phone) push(new TextRun({ text: h.phone, size: 20, color: "555555" }));
  const link = (label: string, url?: string) => {
    if (!url) return;
    push(
      new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: label, size: 20, color: "555555", underline: {} })],
      })
    );
  };
  link(h.links?.linkedin?.replace(/^https?:\/\/(www\.)?/, "") ?? "", h.links?.linkedin);
  link(h.links?.github?.replace(/^https?:\/\/(www\.)?/, "") ?? "", h.links?.github);
  link(h.links?.website?.replace(/^https?:\/\/(www\.)?/, "") ?? "", h.links?.website);
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
