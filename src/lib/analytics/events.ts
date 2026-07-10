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
