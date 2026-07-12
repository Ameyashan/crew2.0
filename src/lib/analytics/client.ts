"use client";

import { sendGAEvent } from "@next/third-parties/google";
import { isProductEventName, type ProductEventName, type ProductEventProps } from "@/lib/analytics/events";

// Client-side product-event capture. Fires an event to BOTH sinks:
//   1. GA4 (the existing G-0DYRW30JVJ property, via @next/third-parties) — so it
//      shows up in Google Analytics with no new script.
//   2. our first-party product_events table, via POST /api/events — so the
//      cofounder-analytics agent can query it server-side.
//
// Never throws and never blocks the UI: GA is fire-and-forget and the POST is a
// no-await keepalive fetch. Import this only from client components.

const ANON_KEY = "jugaadu_anon_id";

// A stable, non-PII id for the current browser so a signed-out journey can be
// stitched to the account after sign-in. Generated lazily, stored in
// localStorage. Falls back to a volatile id if storage is unavailable.
function anonId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// One-shot anon→account stitch, fired right after sign-in. Hands this browser's
// anon id to the server so it can backfill user_id onto the pre-signup events
// (see /api/analytics/identify). Fire-and-forget; never throws or blocks.
export function stitchAnonToAccount(): void {
  if (typeof window === "undefined") return;
  const id = anonId();
  if (!id) return;
  try {
    void fetch("/api/analytics/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anon_id: id }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function track<E extends ProductEventName>(
  event: E,
  props: ProductEventProps<E> = {} as ProductEventProps<E>,
): void {
  if (!isProductEventName(event)) {
    console.warn("[analytics] unknown event, not tracked:", event);
    return;
  }

  // GA4 custom event (fire-and-forget).
  try {
    sendGAEvent("event", event, { ...props });
  } catch {
    /* GA not ready / blocked — ignore */
  }

  // First-party capture. keepalive lets it survive a navigation right after the
  // click; we deliberately do not await or surface errors.
  try {
    const path = typeof window !== "undefined" ? window.location.pathname : null;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, props, path, anon_id: anonId() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
