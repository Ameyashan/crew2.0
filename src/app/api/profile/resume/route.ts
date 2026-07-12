import { NextRequest } from "next/server";
import { upsertProfile } from "@/lib/profile";
import { withUser } from "@/lib/auth";
import { countStoryEntries, createStoryEntries } from "@/lib/story";
import { extractStoryFromResume } from "@/lib/agents/extract-story";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cap uploads before we read the whole file into memory. App-Router route
// handlers have no default body-size limit, so an unbounded arrayBuffer() read
// can OOM/hang the function; reject anything over 10 MB up front.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Ceiling for the best-effort Story seed so a slow model call can't push the
// whole upload toward the 60s maxDuration. The resume text is already saved by
// the time we seed, so a timeout just means "no entries this round".
const SEED_TIMEOUT_MS = 25_000;

export async function POST(req: NextRequest) {
  return withUser(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "no file" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: "That file is too large — please keep resumes under 10 MB." },
        { status: 413 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name || "resume";
    const lower = name.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";

    let text = "";
    try {
      if (isPdf) {
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
      // Log the real error server-side; keep the client message generic.
      console.error("[resume] parse failed", e);
      return Response.json(
        { error: "Couldn't read that file. Try a different PDF, DOCX, or TXT." },
        { status: 500 },
      );
    }

    text = text.replace(/\0/g, "").trim();
    if (!text) {
      // A text-less PDF is almost always a scanned/image export — give a hint
      // the user can act on rather than the raw "empty extracted text".
      const error = isPdf
        ? "Couldn't read any text — this looks like a scanned or image-only PDF. Try a text-based PDF, DOCX, or TXT."
        : "That file didn't contain any readable text.";
      return Response.json({ error }, { status: 422 });
    }

    try {
      await upsertProfile({ resume_text: text, resume_filename: name });
    } catch (e) {
      console.error("[resume] save failed", e);
      return Response.json({ error: "Couldn't save your resume. Please try again." }, { status: 500 });
    }

    // Seed the Story from the resume — the prototype's "{n} entries extracted".
    // Best-effort and idempotent: only when the account has no entries yet, so a
    // re-upload doesn't duplicate. A failure OR a timeout here never blocks the
    // upload — the resume text is already saved above, so we just report
    // seeded: 0 and let the user add Story entries later.
    let seeded = 0;
    try {
      if ((await countStoryEntries()) === 0) {
        const entries = await withTimeout(extractStoryFromResume(text), SEED_TIMEOUT_MS);
        if (entries?.length) seeded = await createStoryEntries(entries);
      }
    } catch (e) {
      console.error("[resume] story seed failed", e);
    }

    return Response.json({ ok: true, characters: text.length, filename: name, seeded });
  });
}

// Resolves to the promise's value, or null if it doesn't settle within `ms`.
// Used to bound the best-effort Story seed so the upload always returns promptly.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
