import type { Metadata } from "next";

// Server wrapper carrying SEO metadata for the public changelog (the page itself
// is a "use client" component and can't export metadata).
export const metadata: Metadata = {
  title: "Changelog",
  description: "What the Jugaadu crew shipped this week — built in public.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
