import { NextRequest } from "next/server";
import { runReachOutStream, type RunReachOutInput } from "@/lib/agents/reach-out";
import { resolveUserId } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";
import { supabaseAdmin } from "@/lib/supabase";
import { parseAgents } from "@/lib/agent-selection";
import { isJobBoardUrl } from "@/lib/kind-detect";
import { assertAnonRunAllowed } from "@/lib/anon-rate-limit";

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
    const agentsRaw = form.get("agents");

    let picked: RunReachOutInput["picked"] | undefined;
    if (typeof pickedRaw === "string" && pickedRaw.trim()) {
      try {
        picked = JSON.parse(pickedRaw);
      } catch {
        return { error: "invalid picked json", status: 400 };
      }
    }

    let agents: string[] | undefined;
    if (typeof agentsRaw === "string" && agentsRaw.trim()) {
      try {
        agents = parseAgents(JSON.parse(agentsRaw));
      } catch {
        return { error: "invalid agents json", status: 400 };
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
        agents,
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
      agents: parseAgents(body?.agents),
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
  // currentUserId() call deep in the pipeline throws. A null userId is an
  // anonymous blur-gate teaser: the crew runs but persists nothing (the agent
  // gates its writes on maybeUserId()). Cap anonymous compute first.
  const userId = await resolveUserId();
  if (!userId) {
    const limited = await assertAnonRunAllowed(req);
    if (limited) return limited;
  }

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
  // Anonymous runs persist nothing — no compose_runs row. composeRunId stays
  // null, which the stream + final update already treat as "don't persist".
  let composeRunId: string | null = null;
  if (userId) {
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

        // Guarded enqueue: once the client disconnects (e.g. the phone was
        // locked) enqueue throws. Swallow it so the agent loop keeps running to
        // completion and we still persist the result — the client recovers by
        // polling compose_runs.
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // stream already closed/cancelled — drop the event, keep working
          }
        };

        try {
          if (composeRunId) {
            // Send the run id back so the client can stash it (used later when
            // the user reopens the run from /app/history).
            send({ type: "compose_run", id: composeRunId });
          }
          if (isJobBoardUrl(input.text) && !input.picked) {
            // The person flow was handed a job-board URL — tip the client off
            // so a research dead-end can offer the job path instead.
            send({ type: "kind_suggestion", suggest: "job" });
          }
          for await (const evt of runReachOutStream({
            ...input,
            compose_run_id: composeRunId ?? undefined,
          })) {
            send(evt);

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
          send({ type: "error", message: errorMessage });
        } finally {
          // Guard against a double/late close throwing — on a disconnected stream
          // that rejection would skip the compose_runs persist below.
          try {
            controller.close();
          } catch {
            // already closed
          }
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
