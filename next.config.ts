import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (bundles pdfjs) and mammoth rely on Node-specific dynamic loading
  // that breaks when bundled into a serverless function; load them via
  // native require instead. Without this, resume parsing 500s in production.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
