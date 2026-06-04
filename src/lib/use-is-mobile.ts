"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` on phone-sized viewports.
 *
 * Starts `false` so the server render and the first client render agree on the
 * desktop layout, then corrects after mount — this avoids a hydration mismatch
 * while still switching to the mobile layout as soon as the component runs in
 * the browser.
 */
export function useIsMobile(query = "(max-width: 760px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return isMobile;
}
