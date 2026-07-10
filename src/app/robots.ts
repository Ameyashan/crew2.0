import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Keep crawlers out of the authenticated app, onboarding, auth exchange and API
// surface; let them index the marketing/changelog content and find the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/onboarding/", "/api/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
