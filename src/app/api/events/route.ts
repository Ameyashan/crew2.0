import { NextRequest } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isProductEventName } from "@/lib/analytics/events";

export const runtime = "nodejs";

// First-party product-analytics ingest. The client track() helper
// (src/lib/analytics/client.ts) POSTs here in addition to firing GA4. Public by
// design: signed-out (blur-gate) visitors are exactly who we want to measure, so
// there is no auth gate — instead we resolve the session opportunistically
// (null for anon) and validate the event name against the registry so the table
// stays queryable. Never trusts the client for user_id.
//
// Deliberately lightweight (no schema lib): validate the event name, coerce a
// bounded props object, drop everything else. Malformed bodies get a 400 but
// analytics failures never surface to the user.

const MAX_PROPS_BYTES = 4_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const event = b.event;
  if (!isProductEventName(event)) {
    return Response.json({ error: "unknown event" }, { status: 400 });
  }

  // Bound the props payload; never let a client write an unbounded blob.
  let props: Record<string, unknown> = {};
  if (b.props && typeof b.props === "object") {
    const json = JSON.stringify(b.props);
    if (json.length <= MAX_PROPS_BYTES) props = b.props as Record<string, unknown>;
  }

  // user_id is resolved server-side from the session cookie, NEVER from the
  // body. anon_id/path/session_id are client-supplied context (non-sensitive).
  const userId = await resolveUserId();
  const anonId = typeof b.anon_id === "string" ? b.anon_id.slice(0, 64) : null;
  const path = typeof b.path === "string" ? b.path.slice(0, 512) : null;
  const sessionId = typeof b.session_id === "string" ? b.session_id.slice(0, 64) : null;

  try {
    await supabaseAdmin().from("product_events").insert({
      user_id: userId,
      anon_id: anonId,
      event,
      props,
      path,
      session_id: sessionId,
    });
  } catch (e) {
    console.error("[product_events] ingest failed", e);
    // Swallow — the client fired GA already and must not retry-storm.
  }

  return new Response(null, { status: 204 });
}
