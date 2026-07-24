import { NextRequest, after } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { type RunReachOutInput } from "@/lib/agents/reach-out";
import { resolveUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { parseAgents } from "@/lib/agent-selection";
import { assertAnonRunAllowed } from "@/lib/anon-rate-limit";
import { runPersonPipeline, type PersonPayload } from "@/lib/runs/execute-person";
import { makeDbSink } from "@/lib/runs/sink";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Same anon-owning cookie the apply route sets — signed-out runs persist and
// stay observable across a background+reload.
const ANON_COOKIE = "jugaadu_anon";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type ParsedInput = {
  input: RunReachOutInput;
  screenshot_id?: string;
};

// Parse the request into the reach-out input + optional screenshot id. A raw
// multipart `intent_image` is still accepted for back-compat, but the durable
// pipeline reloads the image from storage via screenshot_id (a background job
// can't re-read a request File), so the raw bytes are validated then dropped.
async function parseInput(req: NextRequest): Promise<ParsedInput | { error: string; status: number }> {
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

    // Validate the image if present (keeps the old 415/413 contract), but the
    // pipeline loads it from storage — so we don't forward the raw bytes.
    if (image instanceof File && image.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
        return { error: `unsupported image type: ${image.type}`, status: 415 };
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return { error: "image exceeds 5MB limit", status: 413 };
      }
    }

    return {
      input: {
        text,
        intent: typeof intent === "string" && intent ? intent : undefined,
        picked,
        provided_email:
          typeof providedEmail === "string" && providedEmail.trim() ? providedEmail.trim() : undefined,
        agents,
      },
      screenshot_id: typeof screenshotId === "string" && screenshotId.trim() ? screenshotId.trim() : undefined,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    input: {
      text: (body?.text ?? "").toString(),
      intent: body?.intent ? body.intent.toString() : undefined,
      picked: body?.picked && typeof body.picked === "object" ? body.picked : undefined,
      provided_email:
        typeof body?.provided_email === "string" && body.provided_email.trim() ? body.provided_email.trim() : undefined,
      agents: parseAgents(body?.agents),
    },
    screenshot_id: typeof body?.screenshot_id === "string" && body.screenshot_id.trim() ? body.screenshot_id.trim() : undefined,
  };
}

// POST /api/compose
//
// Starts a durable person (reach-out) run: persists a compose_runs row carrying
// the run's inputs (payload), then drives it to completion in a background
// continuation (next/server `after()`) that outlives this request — so
// backgrounding the app no longer strands the run. The cron worker
// (/api/cron/run-worker) re-drives anything whose lease goes stale. The client
// observes progress by polling /api/compose/history/[id].
export async function POST(req: NextRequest) {
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

  // Resolve or mint the anon token for a signed-out run so its row is owned and
  // observable.
  let anonId: string | null = null;
  if (!userId) {
    const jar = await cookies();
    anonId = jar.get(ANON_COOKIE)?.value || null;
    if (!anonId) {
      anonId = randomUUID();
      jar.set(ANON_COOKIE, anonId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: ANON_COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  const payload: PersonPayload = {
    text: input.text,
    intent: input.intent,
    picked: input.picked ?? null,
    provided_email: input.provided_email,
    screenshot_id,
    agents: input.agents,
  };

  const nowIso = new Date().toISOString();
  let composeRunId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("compose_runs")
      .insert({
        user_id: userId,
        anon_id: anonId,
        kind: "person",
        input: input.text,
        intent: input.intent ?? null,
        provided_email: input.provided_email ?? null,
        screenshot_id: screenshot_id ?? null,
        picked: input.picked ?? null,
        payload,
        outcome: "in_flight",
        heartbeat_at: nowIso,
        locked_at: nowIso,
      })
      .select("id")
      .single();
    if (error) throw error;
    composeRunId = data?.id ?? null;
  } catch (e) {
    console.error("[compose_runs] insert failed", e);
  }

  if (!composeRunId) {
    return Response.json({ error: "could not start run" }, { status: 500 });
  }
  const runId = composeRunId;

  // Execute in the background so the run survives the client disconnecting.
  after(() => runPersonPipeline(runId, makeDbSink({ table: "compose_runs", id: runId, statusColumn: "outcome" })));

  return Response.json({ composeRunId: runId, outcome: "in_flight" }, { status: 202 });
}
