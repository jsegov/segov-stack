#!/usr/bin/env node
// Lints every skill under skills/ against the rules in AGENTS.md. Exits 1 on any error.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESSES, isUserInvoked, readSkills } from "./lib/skills.mjs";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_KEYS = new Set([
  // Agent Skills spec
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  // Extensions we deliberately use
  "disable-model-invocation",
  "argument-hint",
]);
const BODY_LINE_LIMIT = 500;
const CODEX_BYTE_LIMIT = 8000;

// Text that only means something in one harness. Harness notes (harness/<harness>.md) are exempt.
const HARNESS_TOKENS = [
  [/\bAskUserQuestion\b/, "AskUserQuestion (Claude Code tool name)"],
  [/\bsubagent_type\b/, "subagent_type (harness-specific subagent field)"],
  [/\bTodoWrite\b/, "TodoWrite (Claude Code tool name)"],
  [/\bTask tool\b/, "'Task tool' (harness-specific tool name)"],
  [/\$ARGUMENTS\b/, "$ARGUMENTS (Claude Code substitution)"],
  [/\$\{CLAUDE_[A-Z_]+\}/, "${CLAUDE_*} (Claude Code substitution)"],
  [/(^|\s)!`/m, "!`command` (Claude Code dynamic context injection)"],
  [/^```!/m, "```! fence (Claude Code dynamic context injection)"],
  [/(^|[\s`'"(~/])\.(claude|cursor|codex|opencode)\//, "a harness config path (.claude/, .codex/, ...)"],
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = lstatSync(full);
    out.push({ path: full, stat });
    if (stat.isDirectory()) out.push(...walk(full));
  }
  return out;
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

function checkReferences(skill, file, text, error) {
  const fileDir = dirname(file);
  const relFile = relative(skill.dir, file);

  for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const path = resolve(fileDir, decodeURI(target.split("#")[0]));
    if (!isInside(skill.dir, path)) error(`${relFile} links outside the skill directory: ${target}`);
    else if (!existsSync(path)) error(`${relFile} links to a missing file: ${target}`);
  }

  // Paths with placeholders such as `harness/<harness>.md` don't match, so they aren't checked.
  for (const [, target] of text.matchAll(/`((?:references|scripts|assets|harness|agents)\/[\w./-]+)`/g)) {
    if (!existsSync(join(skill.dir, target))) error(`${relFile} mentions a missing file: ${target}`);
  }
}

export function lintSkill(skill) {
  const findings = [];
  const error = (message) => findings.push({ skill: skill.dirName, level: "error", message });
  const warning = (message) => findings.push({ skill: skill.dirName, level: "warning", message });

  skill.errors.forEach(error);
  if (!skill.frontmatter) return findings;
  const fm = skill.frontmatter;

  // Name
  if (typeof fm.name !== "string" || fm.name === "") error("frontmatter `name` is missing");
  else {
    if (!NAME_PATTERN.test(fm.name) || fm.name.length > 64)
      error(`name "${fm.name}" must be lowercase letters, digits and single hyphens, at most 64 chars`);
    if (fm.name !== skill.dirName) error(`name "${fm.name}" must equal the directory name "${skill.dirName}"`);
  }

  // Description
  if (typeof fm.description !== "string" || fm.description.trim() === "")
    error("frontmatter `description` is missing");
  else {
    if (fm.description.length > 1024) error(`description is ${fm.description.length} chars; the limit is 1024`);
    if (/[<>]/.test(fm.description)) error("description must not contain < or >");
  }

  // Keys
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) error(`frontmatter key \`${key}\` is not allowed (see AGENTS.md)`);
  }
  if (fm.compatibility !== undefined && (typeof fm.compatibility !== "string" || fm.compatibility.length > 500))
    error("compatibility must be a string of at most 500 chars");
  if (fm.metadata !== undefined) {
    const valid =
      fm.metadata !== null &&
      typeof fm.metadata === "object" &&
      !Array.isArray(fm.metadata) &&
      Object.values(fm.metadata).every((value) => typeof value === "string");
    if (!valid) error("metadata must be a map of string keys to string values");
  }
  if (fm["disable-model-invocation"] !== undefined && typeof fm["disable-model-invocation"] !== "boolean")
    error("disable-model-invocation must be true or false");

  // User-invoked flags: all three harnesses must agree.
  const claudeUserOnly = isUserInvoked(skill);
  const codexUserOnly = skill.openaiYaml?.policy?.allow_implicit_invocation === false;
  const opencodeUserOnly = fm.metadata?.["opencode/autoinvoke"] === "false";
  if (claudeUserOnly !== codexUserOnly || claudeUserOnly !== opencodeUserOnly) {
    error(
      "user-invoked flags disagree: set all of `disable-model-invocation: true`, " +
        "agents/openai.yaml `policy.allow_implicit_invocation: false` and " +
        '`metadata: {"opencode/autoinvoke": "false"}`, or none of them ' +
        `(found claude=${claudeUserOnly}, codex=${codexUserOnly}, opencode=${opencodeUserOnly})`,
    );
  }

  // Harness notes: all or nothing.
  const harnessDir = join(skill.dir, "harness");
  if (existsSync(harnessDir)) {
    const expected = HARNESSES.map((harness) => `${harness}.md`);
    const present = readdirSync(harnessDir).filter((entry) => !entry.startsWith("."));
    for (const file of expected) if (!present.includes(file)) error(`harness/ is missing ${file}`);
    for (const file of present) if (!expected.includes(file)) error(`harness/${file} is not a supported harness note`);
  }

  // Files: no symlinks; harness-neutral text; references resolve.
  for (const { path, stat } of walk(skill.dir)) {
    const rel = relative(skill.dir, path);
    if (stat.isSymbolicLink()) {
      error(`${rel} is a symlink; Codex drops symlinks on install`);
      continue;
    }
    if (!stat.isFile() || !path.endsWith(".md")) continue;
    const text = readFileSync(path, "utf8");
    if (!rel.startsWith(`harness${sep}`)) {
      for (const [pattern, label] of HARNESS_TOKENS) {
        if (pattern.test(text)) error(`${rel} uses ${label}; move it to a harness note or reword it neutrally`);
      }
    }
    checkReferences(skill, path, text, error);
  }

  // Size
  const lines = skill.body.split("\n").length;
  if (lines > BODY_LINE_LIMIT) warning(`SKILL.md body is ${lines} lines; keep it under ${BODY_LINE_LIMIT}`);
  const bytes = Buffer.byteLength(skill.raw);
  if (bytes > CODEX_BYTE_LIMIT)
    warning(`SKILL.md is ${bytes} bytes; Codex truncates explicitly invoked skills at ${CODEX_BYTE_LIMIT}`);

  return findings;
}

export function lintRepo(root) {
  return readSkills(root).flatMap(lintSkill);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const findings = lintRepo(root);
  for (const { skill, level, message } of findings) console.log(`${level}: skills/${skill}: ${message}`);
  const errors = findings.filter((finding) => finding.level === "error").length;
  console.log(`${readSkills(root).length} skill(s), ${errors} error(s), ${findings.length - errors} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}
