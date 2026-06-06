import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import {
  Bricolage_Grotesque,
  Caveat,
  DM_Serif_Display,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  JetBrains_Mono,
  Newsreader,
  Noto_Sans_Devanagari,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});
const notoDevan = Noto_Sans_Devanagari({
  variable: "--font-noto-devan",
  subsets: ["devanagari", "latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
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
  notoDevan.variable,
  caveat.variable,
].join(" ");

export const metadata: Metadata = {
  title: "Jugaadu",
  description: "A personal OS for the ambitious.",
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
