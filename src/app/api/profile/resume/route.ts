import { NextRequest } from "next/server";
import { upsertProfile } from "@/lib/profile";
import { withUser } from "@/lib/auth";
import { seedStoryFromResume } from "@/lib/story/seed";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  return withUser(async (userId) => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "no file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name || "resume";
    const lower = name.toLowerCase();

    let text = "";
    try {
      if (lower.endsWith(".pdf") || file.type === "application/pdf") {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const out = await extractText(pdf, { mergePages: true });
        text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
      } else if (lower.endsWith(".docx") || file.type.includes("officedocument")) {
        const mammoth = (await import("mammoth")) as unknown as {
          extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
        };
        const out = await mammoth.extractRawText({ buffer: buf });
        text = out.value;
      } else if (lower.endsWith(".txt") || file.type.startsWith("text/")) {
        text = buf.toString("utf8");
      } else {
        return Response.json({ error: `unsupported file type: ${file.type || lower}` }, { status: 415 });
      }
    } catch (e) {
      console.error("[resume] parse failed", e);
      return Response.json({ error: `failed to parse: ${e}` }, { status: 500 });
    }

    text = text.replace(/\0/g, "").trim();
    if (!text) return Response.json({ error: "empty extracted text" }, { status: 422 });

    try {
      await upsertProfile({ resume_text: text, resume_filename: name });
    } catch (e) {
      console.error("[resume] save failed", e);
      return Response.json({ error: `failed to save: ${e}` }, { status: 500 });
    }

    // Pre-fill the Story from the resume (prototype's "N entries extracted").
    // Best-effort — a seeding failure must not fail the upload the user just made.
    let storySeeded = 0;
    try {
      storySeeded = await seedStoryFromResume(userId, text);
    } catch (e) {
      console.error("[resume] story seed failed", e);
    }

    return Response.json({ ok: true, characters: text.length, filename: name, story_seeded: storySeeded });
  });
}
