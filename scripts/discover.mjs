#!/usr/bin/env node
// Proves each supported harness discovers every skill, the way a user's install would.
// Codex and opencode run with no model call. Claude Code needs one short model call, so CI skips it.
// Usage: node scripts/discover.mjs [--harness claude,codex,opencode] [--root <dir>]
// Binaries default to `claude`, `codex`, `opencode` on PATH; override with CLAUDE_BIN, CODEX_BIN, OPENCODE_BIN.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isUserInvoked, readSkills } from "./lib/skills.mjs";

export const HARNESS_NAMES = ["claude", "codex", "opencode"];
const TIMEOUT_MS = 120_000;

export function expectedSkills(root) {
  return readSkills(root)
    .filter((skill) => typeof skill.frontmatter?.name === "string")
    .map((skill) => ({ name: skill.frontmatter.name, dir: skill.dir, userInvoked: isUserInvoked(skill) }));
}

// --- Parsers (pure, unit-tested against recorded CLI output) ---

export function parseClaudeInit(event, pluginName) {
  const prefix = `${pluginName}:`;
  return {
    skills: (event.skills ?? []).filter((skill) => skill.startsWith(prefix)).map((skill) => skill.slice(prefix.length)),
    pluginLoaded: (event.plugins ?? []).some((plugin) => plugin.name === pluginName),
    errors: (event.plugin_errors ?? []).map((error) => `${error.plugin}: ${error.message}`),
  };
}

// Returns the plugin's skill names that Codex lists to the model, which it writes as `<plugin>:<skill>`.
export function parseCodexPromptInput(items, pluginName) {
  const texts = items.flatMap((item) => (item.content ?? []).map((part) => part.text ?? ""));
  const block = texts.find((text) => text.includes("<skills_instructions>"));
  if (!block) return [];
  const prefix = `${pluginName}:`;
  return [...block.matchAll(/^- ([^\s:]+:[^\s:]+): .*\(file: [^)]*\)$/gm)]
    .map(([, name]) => name)
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
}

export function parseOpencodeSkills(response, home) {
  return (response.data ?? [])
    .filter((skill) => !skill.path?.startsWith("/builtin/"))
    .map((skill) => ({ id: skill.id, autoinvoke: skill.autoinvoke !== false, isolated: skill.path?.startsWith(home) }));
}

// --- Comparison ---

export function compareClaude(expected, found) {
  const problems = [...found.errors];
  if (!found.pluginLoaded) problems.push("plugin did not load");
  for (const { name } of expected) if (!found.skills.includes(name)) problems.push(`missing ${name}`);
  for (const name of found.skills) if (!expected.some((skill) => skill.name === name)) problems.push(`unexpected ${name}`);
  return problems;
}

export function compareCodex(expected, visible) {
  const problems = [];
  for (const { name, userInvoked } of expected) {
    if (userInvoked && visible.includes(name)) problems.push(`user-invoked ${name} is visible to the model`);
    if (!userInvoked && !visible.includes(name)) problems.push(`missing ${name}`);
  }
  for (const name of visible) if (!expected.some((skill) => skill.name === name)) problems.push(`unexpected ${name}`);
  return problems;
}

export function compareOpencode(expected, found) {
  const problems = [];
  for (const { name, userInvoked } of expected) {
    const skill = found.find((entry) => entry.id === name);
    if (!skill) problems.push(`missing ${name}`);
    else if (skill.autoinvoke === userInvoked)
      problems.push(`${name} has autoinvoke=${skill.autoinvoke}, expected ${!userInvoked}`);
  }
  for (const skill of found) {
    if (!skill.isolated) problems.push(`skill ${skill.id} leaked in from outside the test home`);
    else if (!expected.some(({ name }) => name === skill.id)) problems.push(`unexpected ${skill.id}`);
  }
  return problems;
}

// --- Process helpers ---

function run(bin, args, options, { stopWhen } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let stopped = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stopWhen && !stopped && stopWhen(stdout)) {
        stopped = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`could not run ${bin}: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stopped) reject(new Error(`${bin} exited ${code}: ${stderr.trim().slice(-500)}`));
      else resolvePromise(stdout);
    });
  });
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

// A fake home with an empty workspace, so the user's own skills and config stay out of the result.
function makeHome() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "segov-discover-")));
  const workspace = join(home, "workspace");
  mkdirSync(workspace);
  return { home, workspace };
}

function readManifest(root, file) {
  return JSON.parse(readFileSync(join(root, ".claude-plugin", file), "utf8"));
}

// --- Harnesses ---

async function discoverClaude(root, expected) {
  const pluginName = readManifest(root, "plugin.json").name;
  const isInit = (line) => line.includes('"subtype":"init"');
  const stdout = await run(
    process.env.CLAUDE_BIN ?? "claude",
    ["-p", "Reply with OK.", "--plugin-dir", root, "--output-format", "stream-json", "--verbose", "--max-turns", "1"],
    { cwd: tmpdir() },
    { stopWhen: (text) => text.split("\n").some(isInit) },
  );
  const line = stdout.split("\n").find(isInit);
  if (!line) return ["no system/init event in output"];
  return compareClaude(expected, parseClaudeInit(JSON.parse(line), pluginName));
}

// Installs the repo the way a Codex user does (marketplace add, then plugin add), then reads the model's skill list.
async function discoverCodex(root, expected) {
  const pluginName = readManifest(root, "plugin.json").name;
  const marketplace = readManifest(root, "marketplace.json").name;
  const { home, workspace } = makeHome();
  mkdirSync(join(home, ".codex"));
  const bin = process.env.CODEX_BIN ?? "codex";
  const options = { cwd: workspace, env: { ...process.env, HOME: home, CODEX_HOME: join(home, ".codex") } };
  try {
    await run(bin, ["plugin", "marketplace", "add", root], options);
    await run(bin, ["plugin", "add", `${pluginName}@${marketplace}`], options);
    const stdout = await run(bin, ["debug", "prompt-input", "hi"], options);
    return compareCodex(expected, parseCodexPromptInput(JSON.parse(stdout), pluginName));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// opencode has no plugin install, so copy the skills into ~/.agents/skills, where `npx skills` and link-skills put them.
async function discoverOpencode(expected) {
  const { home, workspace } = makeHome();
  for (const { name, dir } of expected) cpSync(dir, join(home, ".agents", "skills", name), { recursive: true });
  const port = await freePort();
  const password = "segov-discover";
  const server = spawn(
    process.env.OPENCODE_BIN ?? "opencode",
    ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      cwd: workspace,
      env: { ...process.env, HOME: home, OPENCODE_TEST_HOME: home, OPENCODE_SERVER_PASSWORD: password },
      stdio: "ignore",
    },
  );
  const spawnError = new Promise((_, reject) => server.on("error", (error) => reject(new Error(`could not run opencode: ${error.message}`))));
  const url = `http://127.0.0.1:${port}/api/skill?directory=${encodeURIComponent(workspace)}`;
  const headers = { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` };
  try {
    // The listing is empty for the first moments after boot, so poll until every expected skill appears.
    const deadline = Date.now() + 30_000;
    let found = [];
    while (Date.now() < deadline) {
      try {
        const response = await Promise.race([fetch(url, { headers }), spawnError]);
        if (response.ok) {
          // opencode embeds raw control characters in skill content; strip them before parsing.
          const text = (await response.text()).replace(/[\u0000-\u001f]/g, " ");
          found = parseOpencodeSkills(JSON.parse(text), home);
          if (expected.every(({ name }) => found.some((skill) => skill.id === name))) break;
        }
      } catch (error) {
        if (error.message.startsWith("could not run")) throw error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
    return compareOpencode(expected, found);
  } finally {
    server.kill("SIGTERM");
    rmSync(home, { recursive: true, force: true });
  }
}

export async function discover(root, harness) {
  const expected = expectedSkills(root);
  if (harness === "claude") return discoverClaude(root, expected);
  if (harness === "codex") return discoverCodex(root, expected);
  if (harness === "opencode") return discoverOpencode(expected);
  throw new Error(`unknown harness "${harness}"; expected one of ${HARNESS_NAMES.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      harness: { type: "string", default: HARNESS_NAMES.join(",") },
      root: { type: "string", default: join(dirname(fileURLToPath(import.meta.url)), "..") },
    },
  });
  const root = resolve(values.root);
  let failed = false;
  for (const harness of values.harness.split(",")) {
    try {
      const problems = await discover(root, harness);
      if (problems.length === 0) console.log(`ok   ${harness}: ${expectedSkills(root).length} skill(s) discovered`);
      else {
        failed = true;
        for (const problem of problems) console.log(`FAIL ${harness}: ${problem}`);
      }
    } catch (error) {
      failed = true;
      console.log(`FAIL ${harness}: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
