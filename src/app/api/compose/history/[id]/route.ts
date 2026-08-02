import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { mergeRepickOutput } from "@/lib/runs/repick-merge";

export const runtime = "nodejs";

// Same anon-owning cookie the apply route sets.
const ANON_COOKIE = "jugaadu_anon";

// Resolve a run this caller owns (signed-in by user_id, else the anon cookie),
// selecting the given columns. Returns null when the caller can't be identified
// or the row isn't theirs — the same owner-only gate the GET handler applies.
async function loadOwnedRun(
  id: string,
  columns: string,
): Promise<{ run: Record<string, unknown> | null; error: string | null }> {
  const userId = await resolveUserId();
  const sb = supabaseAdmin();
  let query = sb.from("compose_runs").select(columns).eq("id", id);
  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    const anonId = (await cookies()).get(ANON_COOKIE)?.value;
    if (!anonId) return { run: null, error: null };
    query = query.eq("anon_id", anonId);
  }
  const { data, error } = await query.maybeSingle();
  // A dynamic `.select(string)` widens Supabase's inferred row type to its
  // parse-error shape, so route the result through `unknown` before narrowing.
  return {
    run: (data as unknown as Record<string, unknown> | null) ?? null,
    error: error?.message ?? null,
  };
}

// GET /api/compose/history/[id]
// Returns the full persisted compose run so the client can observe its progress
// (steps + heartbeat) and, on completion, rebuild the package card from output.
// Signed-in callers see their own runs (by user_id); signed-out callers see the
// runs owned by their anon cookie (anon_id) — nothing else.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await resolveUserId();
  const sb = supabaseAdmin();

  let query = sb
    .from("compose_runs")
    .select(
      "id, kind, input, intent, provided_email, picked, output, outcome, error, person_id, screenshot_id, resume_generation_id, steps, heartbeat_at, created_at, completed_at"
    )
    .eq("id", id);

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    // Anonymous: gate strictly on the caller's own anon token.
    const anonId = (await cookies()).get(ANON_COOKIE)?.value;
    if (!anonId) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    query = query.eq("anon_id", anonId);
  }

  const { data: run, error } = await query.maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!run) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Surface the screenshot meta inline so the package card header can show the
  // attached-image chip without a second round-trip. (Anonymous runs don't
  // persist screenshots, so this only ever resolves for signed-in callers.)
  let screenshot: { name: string; size: string } | null = null;
  if (run.screenshot_id && userId) {
    const { data: shot } = await sb
      .from("screenshots")
      .select("path, byte_size")
      .eq("user_id", userId)
      .eq("id", run.screenshot_id)
      .maybeSingle();
    if (shot?.path) {
      const name = shot.path.split("/").pop() || "screenshot";
      const size = shot.byte_size ? `${Math.round(Number(shot.byte_size) / 1024)} KB` : "";
      screenshot = { name, size };
    }
  }

  return Response.json({ run: { ...run, screenshot } });
}

// PATCH /api/compose/history/[id]
// Fold a re-picked hiring-manager contact into a finished run's saved package.
// A re-pick re-drafts under its own (hidden) compose_runs row, so the parent
// run's persisted `output` would otherwise keep showing whoever it first drafted
// for. The client sends the selected contact's { person, enrichment, drafts };
// we merge them into `output` (preserving the résumé, shortlist, and questions)
// so History matches the live selection. Owner-gated like the GET.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { run, error } = await loadOwnedRun(id, "id, output");
  if (error) {
    return Response.json({ error }, { status: 500 });
  }
  if (!run) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
  if (!drafts.length) {
    // Nothing to persist — a contact with no drafts wouldn't render a package.
    return Response.json({ ok: true, unchanged: true });
  }

  const output = mergeRepickOutput(run.output, {
    person: body?.person ?? null,
    enrichment: body?.enrichment ?? null,
    drafts,
  });

  const { error: upErr } = await supabaseAdmin()
    .from("compose_runs")
    .update({ output, heartbeat_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
