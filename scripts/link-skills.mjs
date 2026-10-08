#!/usr/bin/env node
// Dev loop for Codex and opencode: symlinks each skills/<name> into ~/.agents/skills/<name>.
// Claude Code uses `claude --plugin-dir .` instead, so nothing is linked into ~/.claude/skills.
// Usage: node scripts/link-skills.mjs [--unlink] [--target <dir>]
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { listSkillDirs } from "./lib/skills.mjs";

function ourLinks(target, skillsDir) {
  if (!existsSync(target)) return [];
  return readdirSync(target)
    .map((entry) => join(target, entry))
    .filter((path) => lstatSync(path).isSymbolicLink())
    .filter((path) => dirname(resolve(dirname(path), readlinkSync(path))) === skillsDir);
}

export function linkSkills({ root, target, unlink = false }) {
  const skillsDir = join(root, "skills");
  const result = { linked: [], unchanged: [], removed: [], conflicts: [] };

  // Remove links we own whose skill is gone (or all of them, when unlinking).
  for (const link of ourLinks(target, skillsDir)) {
    if (unlink || !existsSync(resolve(dirname(link), readlinkSync(link)))) {
      unlinkSync(link);
      result.removed.push(link);
    }
  }
  if (unlink) return result;

  mkdirSync(target, { recursive: true });
  for (const dir of listSkillDirs(root)) {
    if (!lstatSync(dir).isDirectory()) continue;
    const dest = join(target, dir.split("/").pop());
    if (!lstatSync(dest, { throwIfNoEntry: false })) {
      symlinkSync(dir, dest, "dir");
      result.linked.push(dest);
    } else if (lstatSync(dest).isSymbolicLink() && resolve(dirname(dest), readlinkSync(dest)) === dir) {
      result.unchanged.push(dest);
    } else {
      result.conflicts.push(dest);
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      unlink: { type: "boolean", default: false },
      target: { type: "string", default: join(homedir(), ".agents", "skills") },
    },
  });
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = linkSkills({ root, target: resolve(values.target), unlink: values.unlink });
  for (const path of result.linked) console.log(`linked   ${path}`);
  for (const path of result.removed) console.log(`removed  ${path}`);
  for (const path of result.conflicts) console.error(`conflict ${path} exists and is not a link to this repo; left alone`);
  console.log(`${result.linked.length} linked, ${result.unchanged.length} unchanged, ${result.removed.length} removed`);
  process.exit(result.conflicts.length > 0 ? 1 : 0);
}
