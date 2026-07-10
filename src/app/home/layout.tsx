import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// Server wrapper for the marketing landing. src/app/home/page.tsx re-exports the
// client landing (../page), which is a "use client" component and so cannot
// carry metadata itself — this layout supplies the per-page SEO tags and the
// Organization / SoftwareApplication JSON-LD for the public marketing surface.
export const metadata: Metadata = {
  title: "Hire your crew — the personal OS for ambition",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/home" },
  openGraph: {
    title: `${SITE_NAME} — hire your crew`,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/home`,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      email: "hello@jugaadu.app",
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free during beta",
      },
    },
  ],
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* JSON-LD is inert data, not executable — safe under CSP and rendered
          server-side so no nonce is required. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
