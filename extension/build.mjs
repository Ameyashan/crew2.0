// Build the MV3 extension into extension/dist (load that folder unpacked).
//   npm run ext:build            → dev build (API = http://localhost:3000)
//   npm run ext:build -- --prod  → prod build (API = https://jugaadu.app,
//                                  localhost stripped from the manifest)
//   npm run ext:watch            → dev build + rebuild on change
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const prod = process.argv.includes("--prod");
const watch = process.argv.includes("--watch");

const API_BASE = prod ? "https://jugaadu.app" : "http://localhost:3000";

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (prod) {
    const noLocal = (arr) => arr.filter((m) => !m.includes("localhost"));
    manifest.host_permissions = noLocal(manifest.host_permissions);
    manifest.externally_connectable.matches = noLocal(manifest.externally_connectable.matches);
  }
  writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
  cpSync(join(root, "src/popup/popup.html"), join(dist, "popup.html"));
  cpSync(join(root, "static/panel.css"), join(dist, "panel.css"));
}

const options = {
  entryPoints: {
    background: join(root, "src/background.ts"),
    content: join(root, "src/content/index.ts"),
    popup: join(root, "src/popup/popup.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome110",
  sourcemap: !prod,
  minify: prod,
  define: { __API_BASE__: JSON.stringify(API_BASE) },
  logLevel: "info",
};

copyStatic();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
