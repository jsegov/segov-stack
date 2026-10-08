import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { lintRepo } from "../lint-skills.mjs";
import { copyOfValid, edit, VALID } from "./helpers.mjs";

const SCRIPT = new URL("../lint-skills.mjs", import.meta.url).pathname;
const MODEL_MD = "skills/fixture-model/SKILL.md";
const USER_MD = "skills/fixture-user/SKILL.md";

function errorsAfter(mutate) {
  const root = copyOfValid();
  mutate(root);
  return lintRepo(root)
    .filter((finding) => finding.level === "error")
    .map((finding) => `${finding.skill}: ${finding.message}`);
}

function assertOneError(mutate, pattern) {
  const errors = errorsAfter(mutate);
  assert.equal(errors.length, 1, `expected exactly one error, got:\n${errors.join("\n")}`);
  assert.match(errors[0], pattern);
}

describe("lint-skills", () => {
  test("the valid fixture has no findings", () => {
    assert.deepEqual(lintRepo(VALID), []);
  });

  test("a repo without skills/ has no findings", () => {
    const root = copyOfValid();
    rmSync(join(root, "skills"), { recursive: true });
    assert.deepEqual(lintRepo(root), []);
  });

  test("CLI exits 0 on the valid fixture and 1 on errors", () => {
    assert.equal(spawnSync("node", [SCRIPT, VALID]).status, 0);
    const root = copyOfValid();
    edit(join(root, MODEL_MD), (text) => text.replace("name: fixture-model", "name: other"));
    const result = spawnSync("node", [SCRIPT, root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /error: skills\/fixture-model: name "other" must equal the directory name/);
  });

  describe("structure", () => {
    test("a file directly in skills/", () =>
      assertOneError((root) => writeFileSync(join(root, "skills", "stray.md"), "x"), /stray.md: is not a directory/));

    test("a skill directory without SKILL.md", () =>
      assertOneError((root) => mkdirSync(join(root, "skills", "empty")), /empty: has no SKILL.md/));

    test("SKILL.md without frontmatter", () =>
      assertOneError((root) => writeFileSync(join(root, MODEL_MD), "# No frontmatter\n"), /no YAML frontmatter/));

    test("frontmatter that is not valid YAML", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace("description: Fixture", "description: [Fixture")),
        /not valid YAML/,
      ));

    test("a symlink inside a skill", () =>
      assertOneError(
        (root) => symlinkSync("details.md", join(root, "skills/fixture-model/references/alias.md")),
        /references\/alias.md is a symlink/,
      ));
  });

  describe("frontmatter", () => {
    test("missing name", () =>
      assertOneError((root) => edit(join(root, MODEL_MD), (text) => text.replace("name: fixture-model\n", "")), /`name` is missing/));

    test("name differs from directory", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace("name: fixture-model", "name: fixture-other")),
        /must equal the directory name/,
      ));

    test("name with uppercase letters", () => {
      const errors = errorsAfter((root) => edit(join(root, MODEL_MD), (text) => text.replace("name: fixture-model", "name: Fixture-Model")));
      assert.ok(errors.some((error) => /lowercase letters/.test(error)), errors.join("\n"));
    });

    test("missing description", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace(/description: .*\n/, "")),
        /`description` is missing/,
      ));

    test("description over 1024 chars", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace(/description: .*\n/, `description: ${"a".repeat(1025)}\n`)),
        /1025 chars; the limit is 1024/,
      ));

    test("description with angle brackets", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace("Use only", "Use <only>")),
        /must not contain < or >/,
      ));

    test("a harness-specific key", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace("---\n\n", "allowed-tools: Read\n---\n\n")),
        /key `allowed-tools` is not allowed/,
      ));

    test("metadata with a non-string value", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => text.replace("---\n\n", "metadata:\n  version: 1\n---\n\n")),
        /metadata must be a map of string keys to string values/,
      ));
  });

  describe("user-invoked flags", () => {
    test("only disable-model-invocation set", () =>
      assertOneError(
        (root) => {
          edit(join(root, USER_MD), (text) => text.replace(/metadata:\n.*\n/, ""));
          rmSync(join(root, "skills/fixture-user/agents"), { recursive: true });
        },
        /flags disagree.*claude=true, codex=false, opencode=false/,
      ));

    test("Codex policy missing", () =>
      assertOneError(
        (root) => rmSync(join(root, "skills/fixture-user/agents/openai.yaml")),
        /flags disagree.*claude=true, codex=false, opencode=true/,
      ));

    test("opencode autoinvoke written as a boolean", () => {
      const errors = errorsAfter((root) =>
        edit(join(root, USER_MD), (text) => text.replace('opencode/autoinvoke: "false"', "opencode/autoinvoke: false")),
      );
      assert.ok(errors.some((error) => /metadata must be a map/.test(error)), errors.join("\n"));
      assert.ok(errors.some((error) => /flags disagree/.test(error)), errors.join("\n"));
    });
  });

  describe("harness notes", () => {
    test("a missing harness note", () =>
      assertOneError((root) => rmSync(join(root, "skills/fixture-model/harness/codex.md")), /harness\/ is missing codex.md/));

    test("an unsupported harness note", () =>
      assertOneError(
        (root) => writeFileSync(join(root, "skills/fixture-model/harness/cursor.md"), "x"),
        /harness\/cursor.md is not a supported harness note/,
      ));
  });

  describe("harness-neutral text", () => {
    const cases = [
      ["AskUserQuestion", "Use AskUserQuestion to ask."],
      ["subagent_type", "Set subagent_type to Explore."],
      ["TodoWrite", "Track it with TodoWrite."],
      ["'Task tool'", "Spawn it with the Task tool."],
      ["$ARGUMENTS", "Work on $ARGUMENTS."],
      ["${CLAUDE_*}", "Run ${CLAUDE_SKILL_DIR}/x.sh."],
      ["!`command`", "Status: !`git status`"],
      ["```! fence", "```!\ngit status\n```"],
      ["a harness config path", "Read ~/.claude/rules/x.md."],
    ];
    for (const [label, line] of cases) {
      test(`flags ${label} in SKILL.md`, () =>
        assertOneError(
          (root) => edit(join(root, MODEL_MD), (text) => `${text}\n${line}\n`),
          new RegExp(`SKILL.md uses ${label.replace(/[$*{}()!`'.]/g, "\\$&")}`),
        ));
    }

    test("flags tokens in reference files too", () =>
      assertOneError(
        (root) => edit(join(root, "skills/fixture-model/references/details.md"), (text) => `${text}Use AskUserQuestion.\n`),
        /references\/details.md uses AskUserQuestion/,
      ));

    test("allows tokens in harness notes", () => {
      // The valid fixture's harness/claude-code.md already names AskUserQuestion.
      assert.deepEqual(lintRepo(VALID), []);
    });
  });

  describe("references", () => {
    test("a markdown link to a missing file", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => `${text}\n[gone](references/gone.md)\n`),
        /links to a missing file: references\/gone.md/,
      ));

    test("a markdown link outside the skill", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => `${text}\n[up](../fixture-user/SKILL.md)\n`),
        /links outside the skill directory/,
      ));

    test("a backticked path to a missing file", () =>
      assertOneError(
        (root) => edit(join(root, MODEL_MD), (text) => `${text}\nRun \`scripts/missing.sh\`.\n`),
        /mentions a missing file: scripts\/missing.sh/,
      ));

    test("external links and anchors are not checked", () => {
      const errors = errorsAfter((root) =>
        edit(join(root, MODEL_MD), (text) => `${text}\n[web](https://example.com) [here](#top) [mail](mailto:a@b.c)\n`),
      );
      assert.deepEqual(errors, []);
    });
  });

  describe("size warnings", () => {
    test("warns, without erroring, on a body over 500 lines", () => {
      const root = copyOfValid();
      edit(join(root, MODEL_MD), (text) => text + "line\n".repeat(500));
      const findings = lintRepo(root);
      assert.ok(findings.some((finding) => finding.level === "warning" && /lines; keep it under 500/.test(finding.message)));
      assert.ok(findings.every((finding) => finding.level === "warning"));
    });

    test("warns on SKILL.md over Codex's 8000-byte limit", () => {
      const root = copyOfValid();
      edit(join(root, MODEL_MD), (text) => text + "x".repeat(8000) + "\n");
      assert.ok(lintRepo(root).some((finding) => /Codex truncates/.test(finding.message)));
    });
  });
});
