import { NextRequest } from "next/server";
import { runReachOutStream, type RunReachOutInput } from "@/lib/agents/reach-out";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ParsedInput = {
  input: RunReachOutInput;
  screenshot_id?: string;
};

async function parseInput(req: NextRequest): Promise<
  ParsedInput | { error: string; status: number }
> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const text = (form.get("text") ?? "").toString();
    const intent = form.get("intent");
    const pickedRaw = form.get("picked");
    const image = form.get("intent_image");
    const providedEmail = form.get("provided_email");
    const screenshotId = form.get("screenshot_id");

    let picked: RunReachOutInput["picked"] | undefined;
    if (typeof pickedRaw === "string" && pickedRaw.trim()) {
      try {
        picked = JSON.parse(pickedRaw);
      } catch {
        return { error: "invalid picked json", status: 400 };
      }
    }

    let intent_image: RunReachOutInput["intent_image"];
    if (image instanceof File && image.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
        return { error: `unsupported image type: ${image.type}`, status: 415 };
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return { error: "image exceeds 5MB limit", status: 413 };
      }
      const data = Buffer.from(await image.arrayBuffer()).toString("base64");
      intent_image = { data, media_type: image.type };
    }

    return {
      input: {
        text,
        intent: typeof intent === "string" && intent ? intent : undefined,
        picked,
        intent_image,
        provided_email:
          typeof providedEmail === "string" && providedEmail.trim()
            ? providedEmail.trim()
            : undefined,
      },
      screenshot_id:
        typeof screenshotId === "string" && screenshotId.trim()
          ? screenshotId.trim()
          : undefined,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    input: {
      text: (body?.text ?? "").toString(),
      intent: body?.intent ? body.intent.toString() : undefined,
      picked:
        body?.picked && typeof body.picked === "object" ? body.picked : undefined,
      provided_email:
        typeof body?.provided_email === "string" && body.provided_email.trim()
          ? body.provided_email.trim()
          : undefined,
    },
    screenshot_id:
      typeof body?.screenshot_id === "string" && body.screenshot_id.trim()
        ? body.screenshot_id.trim()
        : undefined,
  };
}

export async function POST(req: NextRequest) {
  // The reach-out agent reads the current user (getProfile, people dedupe, draft
  // persistence) via the AsyncLocalStorage context. Establish it here or every
  // currentUserId() call deep in the pipeline throws.
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await parseInput(req);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const { input, screenshot_id } = parsed;
  if (!input.text.trim()) {
    return Response.json({ error: "empty input" }, { status: 400 });
  }

  // Insert the compose_runs row up front so a run kicked off on mobile shows up
  // on desktop even if the stream dies mid-flight. We'll update outcome /
  // collected output once the stream terminates.
  const sb = supabaseAdmin();
  let composeRunId: string | null = null;
  try {
    const { data, error } = await sb
      .from("compose_runs")
      .insert({
        user_id: userId,
        kind: "person",
        input: input.text,
        intent: input.intent ?? null,
        provided_email: input.provided_email ?? null,
        screenshot_id: screenshot_id ?? null,
        picked: input.picked ?? null,
        outcome: "in_flight",
      })
      .select("id")
      .single();
    if (error) throw error;
    composeRunId = data?.id ?? null;
  } catch (e) {
    // Non-fatal: a failed insert shouldn't block the live stream — it just
    // means this run won't appear in /app/history. Log and keep going.
    console.error("[compose_runs] insert failed", e);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithUser(userId, async () => {
        // Collected per-step output so we can patch compose_runs at the end.
        // Mirrors what runs-store.ts builds client-side, but on the server.
        const drafts: unknown[] = [];
        let person: unknown = null;
        let enrichment: unknown = null;
        let candidates: unknown[] | null = null;
        let personId: string | null = null;
        let outcome: "complete" | "error" | "needs_disambiguation" = "error";
        let errorMessage: string | null = null;

        try {
          if (composeRunId) {
            // Send the run id back so the client can stash it (used later when
            // the user reopens the run from /app/history).
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "compose_run", id: composeRunId })}\n\n`
              )
            );
          }
          for await (const evt of runReachOutStream({
            ...input,
            compose_run_id: composeRunId ?? undefined,
          })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));

            if (evt.type === "step" && evt.id === "research" && evt.status === "done") {
              person = evt.data;
            } else if (
              evt.type === "step" &&
              evt.id === "email_lookup" &&
              (evt.status === "done" || evt.status === "skipped")
            ) {
              enrichment = evt.data;
            } else if (evt.type === "step" && evt.id === "person_saved") {
              personId = evt.data.id;
            } else if (evt.type === "step" && evt.id === "draft" && evt.status === "done") {
              drafts.push(evt.data);
            } else if (evt.type === "needs_disambiguation") {
              candidates = Array.isArray(evt.data) ? evt.data : null;
              outcome = "needs_disambiguation";
            } else if (evt.type === "complete") {
              if (outcome !== "needs_disambiguation") outcome = "complete";
            } else if (evt.type === "error") {
              outcome = "error";
              errorMessage = evt.message;
            }
          }
        } catch (e) {
          outcome = "error";
          errorMessage = String(e instanceof Error ? e.message : e);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`
            )
          );
        } finally {
          controller.close();
        }

        // Update the run row outside the SSE controller — the client has already
        // seen the stream close, so a slow Supabase write here just delays the
        // next history-page refresh.
        if (composeRunId) {
          try {
            await sb
              .from("compose_runs")
              .update({
                person_id: personId,
                output: { person, enrichment, candidates, drafts },
                outcome,
                error: errorMessage,
                completed_at: new Date().toISOString(),
              })
              .eq("id", composeRunId)
              .eq("user_id", userId);
          } catch (e) {
            console.error("[compose_runs] update failed", e);
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
