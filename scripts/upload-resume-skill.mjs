#!/usr/bin/env node
// Upload a local Agent Skill folder (a directory with SKILL.md at its root,
// plus any scripts/templates) to the Claude Skills API so Jugaadu's resume
// darzi can load it. Prints the skill_id to set as RESUME_SKILL_ID.
//
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/upload-resume-skill.mjs ./resume-writer
//
// Custom Skills do NOT sync across surfaces: a skill authored in Claude Code or
// claude.ai must be uploaded here to be usable from the API. Re-running creates
// a brand-new skill — to publish a new version of an existing skill, use
// client.beta.skills.versions.create(skillId, { files }) instead.
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import Anthropic, { toFile } from "@anthropic-ai/sdk";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/upload-resume-skill.mjs <skill-dir>");
  process.exit(1);
}
if (!existsSync(join(dir, "SKILL.md"))) {
  console.error(
    `error: ${join(dir, "SKILL.md")} not found — point this at the skill's root directory.`
  );
  process.exit(1);
}

const top = basename(dir.replace(/[/\\]+$/, ""));
const SKIP = new Set([".git", "node_modules", ".DS_Store"]);

function walk(d) {
  const out = [];
  for (const name of readdirSync(d)) {
    if (SKIP.has(name)) continue;
    const full = join(d, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Preserve the top-level directory name in every path so the API sees a single
// skill directory with SKILL.md at its root.
const files = await Promise.all(
  walk(dir).map((p) => toFile(readFileSync(p), `${top}/${relative(dir, p)}`))
);

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const skill = await client.beta.skills.create({
  display_title: "Resume Writer",
  files,
  betas: ["skills-2025-10-02"],
});

console.log("\nUploaded skill:");
console.log("  skill_id      :", skill.id);
console.log("  latest_version:", skill.latest_version);
console.log(`\nSet this in your environment (.env.local):\n  RESUME_SKILL_ID=${skill.id}\n`);
