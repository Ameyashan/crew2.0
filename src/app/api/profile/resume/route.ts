import { NextRequest } from "next/server";
import { upsertProfile } from "@/lib/profile";
import { withUser } from "@/lib/auth";
import { countStoryEntries, createStoryEntries } from "@/lib/story";
import { extractStoryFromResume } from "@/lib/agents/extract-story";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withUser(async () => {
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

    // Seed the Story from the resume — the prototype's "{n} entries extracted".
    // Best-effort and idempotent: only when the account has no entries yet, so a
    // re-upload doesn't duplicate. A failure here never blocks the upload.
    let seeded = 0;
    try {
      if ((await countStoryEntries()) === 0) {
        const entries = await extractStoryFromResume(text);
        if (entries.length) seeded = await createStoryEntries(entries);
      }
    } catch (e) {
      console.error("[resume] story seed failed", e);
    }

    return Response.json({ ok: true, characters: text.length, filename: name, seeded });
  });
}
