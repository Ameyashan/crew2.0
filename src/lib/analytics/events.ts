// The typed product-analytics event registry.
//
// One place that names every product event we track and the shape of its
// props. Client code calls track() (client.ts), server code calls trackServer()
// (server.ts); both validate the event name against this registry, co-write to
// GA4 (the existing G-0DYRW30JVJ property) and to the first-party
// `product_events` table (migration 0014) so the cofounder-analytics agent can
// query journeys server-side.
//
// Adding a new tag = add a member here + a call site. Keep names snake_case and
// past-tense-ish ("run_completed", not "completeRun") to match GA conventions.

export const PRODUCT_EVENTS = {
  // Acquisition / activation
  signup: {},
  sign_in: {},
  onboarding_complete: {},
  // Core product usage
  run_started: {} as { agent_type: string },
  run_completed: {} as {
    agent_type: string;
    outcome: "ok" | "error" | "no_match";
    latency_ms?: number;
  },
  resume_export: {} as { format: "pdf" | "docx" },
  // A confirmed real submission on the ATS (extension arm-then-confirm, or a
  // manual "mark submitted" from the popup).
  application_submitted: {} as { surface: string },
  // Outreach send funnel. draft_opened_channel = the user was handed off to
  // Gmail/LinkedIn/X to actually send (the real send-intent moment).
  // message_sent = they confirmed they sent it (writes an interactions row).
  draft_opened_channel: {} as { channel: string },
  message_sent: {} as { channel: string },
  // Jobs company tracker. tracker_company_untrackable = the user asked for a
  // company we have no job board for (demand signal for new adapters).
  tracker_companies_saved: {} as { count: number },
  tracker_company_untrackable: {} as { name: string },
  // LinkedIn connections import (Settings) — powers "people you know at X".
  connections_imported: {} as { count: number },
  connections_cleared: {},
  // Signed-out funnel (blur gate)
  blur_gate_hit: {},
  blur_gate_signin_click: {},
} as const;

export type ProductEventName = keyof typeof PRODUCT_EVENTS;

// Props type for a given event name (defaults to an open record so call sites
// can attach ad-hoc context without a registry change for one-off dimensions).
export type ProductEventProps<E extends ProductEventName> =
  (typeof PRODUCT_EVENTS)[E] & Record<string, unknown>;

const EVENT_NAME_SET = new Set(Object.keys(PRODUCT_EVENTS));

// Runtime guard used by the ingest route (untrusted client input) — we don't
// pull in a schema lib for one enum. Unknown event names are rejected so the
// table stays queryable against the registry.
export function isProductEventName(x: unknown): x is ProductEventName {
  return typeof x === "string" && EVENT_NAME_SET.has(x);
}

export const PRODUCT_EVENT_NAMES = Object.keys(PRODUCT_EVENTS) as ProductEventName[];
