import type { NextConfig } from "next";

// Content-Security-Policy shipped in REPORT-ONLY mode first (see
// docs/cofounder/security). The landing page uses heavy inline styles and GA is
// injected inline by @next/third-parties, so a strict policy would break them;
// report-only lets us watch for violations in production for one deploy before
// flipping to enforcing in a follow-up PR. 'unsafe-inline' in script/style is a
// deliberate, documented tradeoff pending a nonce-based CSP.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
].join("; ");

// Static security headers applied to every route. All low-risk except CSP,
// which is report-only above.
const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // unpdf (bundles pdfjs) and mammoth rely on Node-specific dynamic loading
  // that breaks when bundled into a serverless function; load them via
  // native require instead. Without this, resume parsing 500s in production.
  serverExternalPackages: ["unpdf", "mammoth"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
