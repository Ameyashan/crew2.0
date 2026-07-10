import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only publicly indexable content belongs here. The signed-in app (/app/**),
// onboarding, auth and API routes are intentionally excluded (and marked
// noindex in their layouts). The marketing surface is /home; /changelog is the
// public "built in public" log.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/home`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
}
