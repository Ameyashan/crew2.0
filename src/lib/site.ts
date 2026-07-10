// Canonical site constants for SEO (metadataBase, sitemap, robots, OG). Kept in
// one place so the cofounder-seo agent has a single source of truth to update.
// Override the origin per-environment with NEXT_PUBLIC_SITE_URL (e.g. a preview
// deploy); defaults to the production domain.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jugaadu.app"
).replace(/\/$/, "");

export const SITE_NAME = "Jugaadu";
export const SITE_TAGLINE = "A personal OS for the ambitious.";
export const SITE_DESCRIPTION =
  "Jugaadu is a crew of AI agents that run your job hunt and career growth — " +
  "finding the opening, the person who decides, and a verified way in, so you " +
  "get there before the role is ever posted.";
