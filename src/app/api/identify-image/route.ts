import { NextRequest } from "next/server";
import { identifyFromImage } from "@/lib/claude";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const BUCKET = "screenshots";

// POST /api/identify-image  (multipart/form-data)
//   image:  the screenshot file (required)
//   text:   anything the user also typed (optional hint)
//   intent: "what do you want to convey" (optional)
//
// Stores the raw image in the private "screenshots" bucket, records a
// screenshots row, then runs a vision pass to decide job-vs-person and pull
// out a search query. Returns that classification so the client can drive the
// existing job/person Compose pipeline.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "expected multipart/form-data" }, { status: 415 });
  }

  const form = await req.formData();
  const image = form.get("image");
  const text = (form.get("text") ?? "").toString();
  const intent = (form.get("intent") ?? "").toString();

  if (!(image instanceof File) || image.size === 0) {
    return Response.json({ error: "image is required" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    return Response.json({ error: `unsupported image type: ${image.type}` }, { status: 415 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "image exceeds 5MB limit" }, { status: 413 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const ext = EXT[image.type] ?? "bin";
  const objectId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${objectId}.${ext}`;

  return runWithUser(userId, async () => {
    const sb = supabaseAdmin();

    // Store the raw image first. A failed upload shouldn't block classification,
    // but we want the file persisted whenever possible.
    let storedPath: string | null = null;
    try {
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: image.type, upsert: false });
      if (upErr) throw upErr;
      storedPath = path;
    } catch (e) {
      console.error("[identify-image] storage upload failed", e);
    }

    let result;
    try {
      result = await identifyFromImage({
        image: { data: bytes.toString("base64"), media_type: image.type },
        text,
        intent,
      });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }

    // Track the upload + what we detected. Non-fatal on failure.
    let screenshotId: string | null = null;
    try {
      const { data, error } = await sb
        .from("screenshots")
        .insert({
          user_id: userId,
          bucket: BUCKET,
          path: storedPath ?? path,
          content_type: image.type,
          byte_size: image.size,
          kind: result.kind,
          detected: result,
        })
        .select("id")
        .single();
      if (error) throw error;
      screenshotId = data?.id ?? null;
    } catch (e) {
      console.error("[screenshots] insert failed", e);
    }

    return Response.json({
      kind: result.kind,
      query: result.query,
      job_url: result.job_url,
      company: result.company,
      role: result.role,
      team: result.team,
      person_name: result.person_name,
      poster_is_hiring_manager: result.poster_is_hiring_manager,
      intent: result.intent,
      summary: result.summary,
      storage_path: storedPath,
      screenshot_id: screenshotId,
    });
  });
}
