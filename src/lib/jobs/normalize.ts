// Best-effort location parsing for ATS listings (Module 1). Feeds give messy,
// free-text locations ("San Francisco, CA", "Remote - US", "London, UK"); we
// extract {city, region, country, remote_type} as far as we can and leave the
// rest null. This NEVER throws and never blocks a job from being stored.

import type { RemoteType } from "@/lib/jobs/types";

export interface ParsedLocation {
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote_type: RemoteType;
}

// Two-letter US state / CA province style token → treat as region, not country.
const REGION_TOKEN = /^[A-Z]{2}$/;
const COUNTRY_HINTS = /(united states|usa|u\.s\.|united kingdom|uk|canada|germany|france|india|ireland|netherlands|australia|singapore|remote)/i;

function remoteFromText(raw: string): RemoteType | null {
  const lo = raw.toLowerCase();
  if (/\bhybrid\b/.test(lo)) return "hybrid";
  if (/\bremote\b|work from home|wfh|distributed/.test(lo)) return "remote";
  if (/on[- ]?site|in[- ]?office|in person/.test(lo)) return "onsite";
  return null;
}

// `remoteHint` comes from an explicit ATS signal (Lever workplaceType, Ashby
// isRemote) and wins over text inference when present.
export function normalizeLocation(
  raw: string | null | undefined,
  remoteHint?: RemoteType | null,
): ParsedLocation {
  const location_raw = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const base: ParsedLocation = {
    location_raw,
    city: null,
    region: null,
    country: null,
    remote_type: remoteHint || "unknown",
  };
  if (!location_raw) return base;

  if (!remoteHint) {
    const inferred = remoteFromText(location_raw);
    if (inferred) base.remote_type = inferred;
  }

  // Strip leading "Remote -" / "Remote |" style prefixes before splitting geo.
  const geo = location_raw.replace(/^\s*remote\s*[-|–:,]\s*/i, "").trim();
  const parts = geo
    .split(/[,/|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return base;
  // Don't treat a bare "Remote" / "Anywhere" as a city.
  if (parts.length === 1 && /^(remote|anywhere|global|worldwide)$/i.test(parts[0])) return base;

  base.city = parts[0] || null;
  if (parts.length === 2) {
    const t = parts[1];
    if (REGION_TOKEN.test(t)) base.region = t;
    else if (COUNTRY_HINTS.test(t) || t.length > 3) base.country = t;
    else base.region = t;
  } else if (parts.length >= 3) {
    base.region = parts[1] || null;
    base.country = parts[parts.length - 1] || null;
  }
  return base;
}
