#!/usr/bin/env node
// Scaffolds a skill that passes lint-skills.mjs.
// Usage: node scripts/new-skill.mjs <name> --description "<when to use it>" [--user-invoked] [--draft] [--root <dir>]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { stringify } from "yaml";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function titleCase(name) {
  return name
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function createSkill({ root, name, description, userInvoked = false, draft = false }) {
  if (!NAME_PATTERN.test(name) || name.length > 64)
    throw new Error(`name "${name}" must be lowercase letters, digits and single hyphens, at most 64 chars`);
  if (!description || description.trim() === "") throw new Error("--description is required");

  const dir = join(root, draft ? "drafts" : "skills", name);
  for (const other of ["skills", "drafts"]) {
    if (existsSync(join(root, other, name))) throw new Error(`${other}/${name} already exists`);
  }

  const frontmatter = { name, description };
  if (userInvoked) {
    frontmatter["disable-model-invocation"] = true;
    frontmatter.metadata = { "opencode/autoinvoke": "false" };
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${stringify(frontmatter)}---\n\n# ${titleCase(name)}\n`);

  if (userInvoked) {
    mkdirSync(join(dir, "agents"));
    const openai = {
      interface: { display_name: titleCase(name), short_description: description.slice(0, 120) },
      policy: { allow_implicit_invocation: false },
    };
    writeFileSync(join(dir, "agents", "openai.yaml"), stringify(openai));
  }
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      description: { type: "string" },
      "user-invoked": { type: "boolean", default: false },
      draft: { type: "boolean", default: false },
      root: { type: "string", default: join(dirname(fileURLToPath(import.meta.url)), "..") },
    },
  });
  if (positionals.length !== 1) {
    console.error('Usage: npm run new-skill -- <name> --description "<when to use it>" [--user-invoked] [--draft]');
    process.exit(1);
  }
  try {
    const dir = createSkill({
      root: resolve(values.root),
      name: positionals[0],
      description: values.description,
      userInvoked: values["user-invoked"],
      draft: values.draft,
    });
    console.log(`Created ${dir}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
