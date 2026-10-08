import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { lintRepo } from "../lint-skills.mjs";
import { createSkill } from "../new-skill.mjs";

const SCRIPT = new URL("../new-skill.mjs", import.meta.url).pathname;
const tempRoot = () => mkdtempSync(join(tmpdir(), "segov-new-skill-"));

describe("new-skill", () => {
  test("a model-invoked skill passes lint and has no Codex file", () => {
    const root = tempRoot();
    const dir = createSkill({ root, name: "write-notes", description: "Use when writing notes: tidy, short, plain." });
    assert.equal(dir, join(root, "skills", "write-notes"));
    assert.deepEqual(lintRepo(root), []);
    assert.equal(existsSync(join(dir, "agents")), false);
    assert.match(readFileSync(join(dir, "SKILL.md"), "utf8"), /^---\nname: write-notes\n/);
  });

  test("a user-invoked skill sets all three flags and passes lint", () => {
    const root = tempRoot();
    const dir = createSkill({ root, name: "ship-it", description: "Release the current branch.", userInvoked: true });
    assert.deepEqual(lintRepo(root), []);
    const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
    assert.match(skillMd, /disable-model-invocation: true/);
    assert.match(skillMd, /opencode\/autoinvoke: "false"/);
    assert.match(readFileSync(join(dir, "agents", "openai.yaml"), "utf8"), /allow_implicit_invocation: false/);
  });

  test("--draft writes to drafts/, which lint ignores", () => {
    const root = tempRoot();
    const dir = createSkill({ root, name: "half-baked", description: "Not ready.", draft: true });
    assert.equal(dir, join(root, "drafts", "half-baked"));
    assert.equal(existsSync(join(root, "skills")), false);
  });

  test("rejects invalid names, missing descriptions and duplicates", () => {
    const root = tempRoot();
    assert.throws(() => createSkill({ root, name: "Bad_Name", description: "x" }), /lowercase letters/);
    assert.throws(() => createSkill({ root, name: "ok", description: "" }), /--description is required/);
    createSkill({ root, name: "taken", description: "x", draft: true });
    assert.throws(() => createSkill({ root, name: "taken", description: "x" }), /drafts\/taken already exists/);
  });

  test("CLI creates the skill and reports usage errors", () => {
    const root = tempRoot();
    const ok = spawnSync("node", [SCRIPT, "cli-made", "--description", "Made by the CLI.", "--root", root], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(existsSync(join(root, "skills", "cli-made", "SKILL.md")));
    const bad = spawnSync("node", [SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Usage:/);
  });
});
