import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compareClaude,
  compareCodex,
  compareOpencode,
  discover,
  expectedSkills,
  parseClaudeInit,
  parseCodexPromptInput,
  parseOpencodeSkills,
} from "../discover.mjs";
import { recorded, VALID } from "./helpers.mjs";

const probe = [
  { name: "probe-skill", userInvoked: false },
  { name: "probe-user", userInvoked: true },
];

describe("discover: parsing recorded CLI output", () => {
  test("expectedSkills reads names and user-invoked flags", () => {
    assert.deepEqual(
      expectedSkills(VALID).map(({ name, userInvoked }) => ({ name, userInvoked })),
      [
        { name: "fixture-model", userInvoked: false },
        { name: "fixture-user", userInvoked: true },
      ],
    );
  });

  test("Claude Code init event (claude 2.1.294)", () => {
    const found = parseClaudeInit(recorded("claude-init.json"), "probe-plugin");
    assert.deepEqual(found, { skills: ["probe-skill", "probe-user"], pluginLoaded: true, errors: [] });
    assert.deepEqual(compareClaude(probe, found), []);
    assert.deepEqual(compareClaude([...probe, { name: "absent" }], found), ["missing absent"]);
    assert.deepEqual(compareClaude(probe, parseClaudeInit(recorded("claude-init.json"), "not-loaded")), [
      "plugin did not load",
      "missing probe-skill",
      "missing probe-user",
    ]);
    const withError = { ...recorded("claude-init.json"), plugin_errors: [{ plugin: "probe-plugin", message: "bad manifest" }] };
    assert.deepEqual(compareClaude(probe, parseClaudeInit(withError, "probe-plugin")), ["probe-plugin: bad manifest"]);
  });

  test("Codex prompt input (codex 0.162.0) keeps only the plugin's skills", () => {
    // Recorded after installing the valid fixture as a plugin; Codex lists its system skills too.
    const fixture = [
      { name: "fixture-model", userInvoked: false },
      { name: "fixture-user", userInvoked: true },
    ];
    const visible = parseCodexPromptInput(recorded("codex-prompt-input.json"), "segov-fixture");
    assert.deepEqual(visible, ["fixture-model"]);
    assert.deepEqual(compareCodex(fixture, visible), []);
    assert.deepEqual(parseCodexPromptInput(recorded("codex-prompt-input.json"), "other-plugin"), []);
    assert.deepEqual(compareCodex(fixture, ["fixture-model", "fixture-user"]), [
      "user-invoked fixture-user is visible to the model",
    ]);
    assert.deepEqual(compareCodex(fixture, []), ["missing fixture-model"]);
  });

  test("opencode skill listing (opencode 2.0.22) drops built-ins and flags leaks", () => {
    // The `leaked` entry was added to the recording to stand for a skill from the real home directory.
    const found = parseOpencodeSkills(recorded("opencode-skills.json"), "/tmp/opencode-home");
    assert.deepEqual(found, [
      { id: "probe-skill", autoinvoke: true, isolated: true },
      { id: "probe-user", autoinvoke: false, isolated: true },
      { id: "leaked", autoinvoke: true, isolated: false },
    ]);
    assert.deepEqual(compareOpencode(probe, found), ["skill leaked leaked in from outside the test home"]);
    const swapped = [{ name: "probe-skill", userInvoked: true }, { name: "probe-user", userInvoked: false }];
    assert.deepEqual(compareOpencode(swapped, found.slice(0, 2)), [
      "probe-skill has autoinvoke=true, expected false",
      "probe-user has autoinvoke=false, expected true",
    ]);
  });
});

// These run the real CLIs against the fixture repo. They make no model calls.
describe("discover: live harnesses", () => {
  test("codex discovers the fixture skills and hides the user-invoked one", { timeout: 150_000 }, async () => {
    assert.deepEqual(await discover(VALID, "codex"), []);
  });

  test("opencode discovers the fixture skills with the right autoinvoke flags", { timeout: 150_000 }, async () => {
    assert.deepEqual(await discover(VALID, "opencode"), []);
  });

  test("an unknown harness is an error", async () => {
    await assert.rejects(discover(VALID, "cursor"), /unknown harness "cursor"/);
  });
});
