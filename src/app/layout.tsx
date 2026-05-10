import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Crew",
  description: "Your outreach copilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[color:var(--color-line)]/60">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-6">
            <Link
              href="/"
              className="text-2xl text-[color:var(--color-clay)] leading-none"
              style={{ fontFamily: "var(--font-newsreader)" }}
            >
              c.
            </Link>
            <nav className="flex gap-5 text-sm">
              <NavLink href="/">Compose</NavLink>
              <NavLink href="/today">Today</NavLink>
              <NavLink href="/people">People</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-8">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] transition-colors"
    >
      {children}
    </Link>
  );
}
