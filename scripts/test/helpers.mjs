import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const VALID = join(FIXTURES, "valid");

export function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, "recorded", name), "utf8"));
}

// A writable copy of the valid fixture repo, so a test can break one thing in it.
export function copyOfValid() {
  const root = mkdtempSync(join(tmpdir(), "segov-test-"));
  cpSync(VALID, root, { recursive: true });
  return root;
}

export function edit(path, transform) {
  writeFileSync(path, transform(readFileSync(path, "utf8")));
}
