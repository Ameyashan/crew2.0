import { supabaseAdmin } from "@/lib/supabase";
import { maybeUserId } from "@/lib/user-context";
import type { ProductEventName, ProductEventProps } from "@/lib/analytics/events";

// Server-side product-event capture. Mirrors the no-throw contract of
// logAgentRun (src/lib/agent-runs.ts): analytics must never take down a request
// or an agent run, so every failure is swallowed and logged.
//
// Writes to the first-party product_events table via the service-role client
// (BYPASSRLS), which is the ONLY thing that can read/write that table (RLS on,
// no policy — see migration 0014). GA4 server-side capture (Measurement
// Protocol) is intentionally deferred: it needs an API secret and the client
// track() already reports these to GA from the browser.

type TrackOpts = {
  // Explicit owner. If omitted we try to read the request-scoped user context
  // (maybeUserId), which THROWS when called outside a user context — so we guard
  // it: routes without withUser()/runWithUser() (e.g. the unauthenticated resume
  // export) simply record a null-owned event.
  userId?: string | null;
  anonId?: string | null;
  path?: string | null;
  sessionId?: string | null;
};

function resolveUser(opts: TrackOpts): string | null {
  if (opts.userId !== undefined) return opts.userId;
  try {
    return maybeUserId();
  } catch {
    return null;
  }
}

export async function trackServer<E extends ProductEventName>(
  event: E,
  props: ProductEventProps<E> = {} as ProductEventProps<E>,
  opts: TrackOpts = {},
): Promise<void> {
  try {
    await supabaseAdmin()
      .from("product_events")
      .insert({
        user_id: resolveUser(opts),
        anon_id: opts.anonId ?? null,
        event,
        props: props ?? {},
        path: opts.path ?? null,
        session_id: opts.sessionId ?? null,
      });
  } catch (e) {
    console.error("[product_events] failed to record", event, e);
  }
}
