import { NextRequest, after } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { parseAgents } from "@/lib/agent-selection";
import { assertAnonRunAllowed } from "@/lib/anon-rate-limit";
import { runPipeline, type RunPayload } from "@/lib/runs/execute-apply";
import { makeDbSink, makeStreamSink } from "@/lib/runs/sink";

export const runtime = "nodejs";
export const maxDuration = 180;

// httpOnly cookie that owns a signed-out visitor's runs so they persist and can
// be observed/recovered across a background+reload, just like a signed-in run.
const ANON_COOKIE = "jugaadu_anon";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// POST /api/compose/apply
//
// Starts a durable job/apply run. The run is persisted as a compose_runs row
// carrying everything needed to execute it (payload), then driven to completion
// by a background continuation (next/server `after()`) that outlives this
// request — so backgrounding the app on mobile no longer strands the run. A
// cron worker (/api/cron/run-worker) re-drives anything whose lease goes stale
// (redeploy / past maxDuration). The client observes progress by polling
// /api/compose/history/[id].
//
// Re-picks (body.picked) are a fast, user-present amendment — those still stream
// SSE synchronously so pickCandidate gets live frames.
export async function POST(req: NextRequest) {
  // Signed-out visitors get the blur-gate teaser; cap anonymous compute first.
  const userId = await resolveUserId();
  if (!userId) {
    const limited = await assertAnonRunAllowed(req);
    if (limited) return limited;
  }

  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const intent = body?.intent ? body.intent.toString() : undefined;
  const prior = body?.prior && typeof body.prior === "object" ? (body.prior as Record<string, unknown>) : null;
  const job_text = body?.job_text ? body.job_text.toString().trim() : "";
  const posterName = body?.person_name ? body.person_name.toString().trim() : "";
  const detectedRole = body?.detected_role ? body.detected_role.toString().trim() : "";
  const detectedCompany = body?.detected_company ? body.detected_company.toString().trim() : "";
  const detectedTeam = body?.detected_team ? body.detected_team.toString().trim() : "";
  const posterIsHiringManager = body?.poster_is_hiring_manager === true;
  const screenshotId = body?.screenshot_id ? body.screenshot_id.toString().trim() : "";
  const agents = parseAgents(body?.agents);
  const picked = body?.picked
    ? {
        name: (body.picked.name ?? "").toString(),
        role: body.picked.role ? body.picked.role.toString() : null,
        company: body.picked.company ? body.picked.company.toString() : null,
        linkedin: body.picked.linkedin ? body.picked.linkedin.toString() : null,
      }
    : null;
  const job_context = body?.job_context
    ? {
        role: body.job_context.role ? body.job_context.role.toString() : null,
        company: body.job_context.company ? body.job_context.company.toString() : null,
      }
    : null;

  // A screenshot-driven run can carry a named poster and/or detected role+company
  // instead of a fetchable URL — the server resolves the real opening from those.
  const screenshotMode = !!posterName || !!(detectedRole && detectedCompany);
  if (!job_url && !screenshotMode) {
    return Response.json({ error: "job_url is required" }, { status: 400 });
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  // Resolve or mint the anon token for a signed-out run so its row is owned and
  // observable. Set it on the outgoing response (httpOnly).
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

  const payload: RunPayload = {
    job_url: job_url || undefined,
    job_text: job_text || undefined,
    intent,
    prior,
    person_name: posterName || undefined,
    detected_role: detectedRole || undefined,
    detected_company: detectedCompany || undefined,
    detected_team: detectedTeam || undefined,
    poster_is_hiring_manager: posterIsHiringManager || undefined,
    screenshot_id: screenshotId || undefined,
    agents,
    picked,
    job_context,
  };

  // Persist the run row up front, self-sufficient (payload) so a fresh worker
  // invocation can execute it with no client involvement. Both fresh runs and
  // re-picks record a row (re-picks are amendments the client dedupes — the
  // historic behaviour). Anonymous runs are owned by anon_id, not user_id.
  const nowIso = new Date().toISOString();
  let composeRunId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("compose_runs")
      .insert({
        user_id: userId,
        anon_id: anonId,
        kind: "job",
        input: job_url || [detectedRole, detectedCompany].filter(Boolean).join(" at ") || posterName,
        intent: intent ?? null,
        picked: picked ?? null,
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
    // Without a persisted row we can't run durably — surface it so the client
    // retries rather than silently losing the run.
    return Response.json({ error: "could not start run" }, { status: 500 });
  }
  const runId = composeRunId;

  // ── Re-pick: stream the amendment live (fast, user is watching).
  if (picked) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        void runPipeline(runId, makeStreamSink(controller, encoder)).finally(() => {
          try {
            controller.close();
          } catch {
            // already closed
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

  // ── Fresh run: execute in the background. `after` extends the serverless
  // invocation past the response (up to maxDuration) independent of the client
  // connection, so the run finishes even if the phone is backgrounded. The
  // client polls /api/compose/history/[id] to observe progress.
  after(() => runPipeline(runId, makeDbSink({ table: "compose_runs", id: runId, statusColumn: "outcome" })));

  return Response.json({ composeRunId: runId, outcome: "in_flight" }, { status: 202 });
}
