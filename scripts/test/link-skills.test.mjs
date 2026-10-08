import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { linkSkills } from "../link-skills.mjs";
import { copyOfValid } from "./helpers.mjs";

const setup = () => ({ root: copyOfValid(), target: join(mkdtempSync(join(tmpdir(), "segov-link-")), "skills") });

describe("link-skills", () => {
  test("links every skill, then is idempotent", () => {
    const { root, target } = setup();
    const first = linkSkills({ root, target });
    assert.equal(first.linked.length, 2);
    assert.equal(readlinkSync(join(target, "fixture-model")), join(root, "skills", "fixture-model"));
    const second = linkSkills({ root, target });
    assert.deepEqual([second.linked.length, second.unchanged.length], [0, 2]);
  });

  test("removes links to deleted skills", () => {
    const { root, target } = setup();
    linkSkills({ root, target });
    rmSync(join(root, "skills", "fixture-user"), { recursive: true });
    const result = linkSkills({ root, target });
    assert.deepEqual(result.removed, [join(target, "fixture-user")]);
    assert.equal(lstatSync(join(target, "fixture-user"), { throwIfNoEntry: false }), undefined);
  });

  test("leaves real directories and foreign links alone and reports them", () => {
    const { root, target } = setup();
    mkdirSync(join(target, "fixture-model"), { recursive: true });
    symlinkSync("/somewhere/else", join(target, "fixture-user"));
    const result = linkSkills({ root, target });
    assert.equal(result.conflicts.length, 2);
    assert.ok(lstatSync(join(target, "fixture-model")).isDirectory());
    assert.equal(readlinkSync(join(target, "fixture-user")), "/somewhere/else");
  });

  test("--unlink removes only this repo's links", () => {
    const { root, target } = setup();
    linkSkills({ root, target });
    symlinkSync("/somewhere/else", join(target, "other-skill"));
    const result = linkSkills({ root, target, unlink: true });
    assert.equal(result.removed.length, 2);
    assert.equal(existsSync(join(target, "fixture-model")), false);
    assert.equal(readlinkSync(join(target, "other-skill")), "/somewhere/else");
  });
});
