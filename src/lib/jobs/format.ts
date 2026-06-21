// Pure display formatters for the job feed UI (Module 6). No React — safe to
// import into client components.

import type { VisaConfidence, SizeBucket } from "@/lib/jobs/types";

// "Posted 3d ago" / "Updated 3d ago" (Greenhouse only exposes updated_at, so the
// caller passes approx=true and we say "Updated" to stay honest).
export function relativePosted(iso: string | null, approx: boolean): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const verb = approx ? "Updated" : "Posted";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) return `${verb} just now`;
  if (diff < day) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 1 ? `${verb} today` : `${verb} ${h}h ago`;
  }
  const d = Math.floor(diff / day);
  if (d < 30) return `${verb} ${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo <= 1 ? `${verb} 1mo ago` : `${verb} ${mo}mo ago`;
}

// Feed badge: only surface a positive signal to avoid clutter. The detail view
// renders the full "visa unclear" wording itself.
export function visaBadge(v: VisaConfidence | null): string | null {
  return v === "likely_sponsors" ? "likely sponsors" : null;
}

export function visaLabelFull(v: VisaConfidence | null): string {
  return v === "likely_sponsors" ? "Likely sponsors visas" : "Visa sponsorship unclear";
}

export function sizeLabel(s: SizeBucket | null): string | null {
  if (!s) return null;
  return s === "startup" ? "startup" : s === "medium" ? "mid-size" : "large";
}

export function scoreTier(score: number): "high" | "mid" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}
