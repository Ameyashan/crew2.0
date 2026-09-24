import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";

// Self-hosted fonts (vendored woff2/ttf in src/app/fonts). These were
// next/font/google, but that downloads from Google's servers at BUILD time, and
// one flaky fetch fails the whole Vercel deploy (Turbopack surfaces it as
// "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"). The CSS
// variable names are unchanged, so everything downstream (globals.css,
// components/paper/fonts.ts) is untouched. Latin subsets, same weights as
// before; the variable-font files carry their full weight range.
const bricolage = localFont({
  variable: "--font-bricolage",
  src: "./fonts/bricolage-grotesque.woff2",
  weight: "200 800",
  display: "swap",
});
const newsreader = localFont({
  variable: "--font-newsreader",
  src: "./fonts/newsreader.woff2",
  weight: "200 800",
  display: "swap",
});
const dmSerif = localFont({
  variable: "--font-dm-serif",
  src: "./fonts/dm-serif-display.woff2",
  weight: "400",
  display: "swap",
});
const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  src: "./fonts/instrument-serif.woff2",
  weight: "400",
  display: "swap",
});
const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  src: "./fonts/space-grotesk.woff2",
  weight: "300 700",
  display: "swap",
});
const geistSans = localFont({
  variable: "--font-geist-sans",
  src: "./fonts/geist.woff2",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  variable: "--font-geist-mono",
  src: "./fonts/geist-mono.woff2",
  weight: "100 900",
  display: "swap",
});
const jetbrains = localFont({
  variable: "--font-jetbrains-mono",
  src: "./fonts/jetbrains-mono.woff2",
  weight: "100 800",
  display: "swap",
});
// IBM Plex Mono powers the "paper" reskin's uppercase mono labels/chips.
const ibmPlexMono = localFont({
  variable: "--font-ibm-plex-mono",
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
});
// Full (unsubset) files so Devanagari and Latin glyphs both stay covered
// without unicode-range splitting, which next/font/local can't express.
const notoDevan = localFont({
  variable: "--font-noto-devan",
  src: [
    { path: "./fonts/noto-sans-devanagari-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/noto-sans-devanagari-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/noto-sans-devanagari-700.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
});
const caveat = localFont({
  variable: "--font-caveat",
  src: "./fonts/caveat.woff2",
  weight: "400 700",
  display: "swap",
});

const fontVars = [
  bricolage.variable,
  newsreader.variable,
  dmSerif.variable,
  instrumentSerif.variable,
  spaceGrotesk.variable,
  geistSans.variable,
  geistMono.variable,
  jetbrains.variable,
  ibmPlexMono.variable,
  notoDevan.variable,
  caveat.variable,
].join(" ");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontVars} h-full antialiased`}>
      <body>{children}</body>
      <GoogleAnalytics gaId="G-0DYRW30JVJ" />
    </html>
  );
}
