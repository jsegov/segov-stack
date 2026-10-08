import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export const HARNESSES = ["claude-code", "codex", "opencode"];

export function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return null;
  return { yaml: match[1], body: match[2] };
}

export function listSkillDirs(root) {
  const skillsDir = join(root, "skills");
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((entry) => !entry.startsWith("."))
    .map((entry) => join(skillsDir, entry));
}

// Reads one skill directory. `errors` holds problems that stop the skill from parsing at all;
// rule checks live in lint-skills.mjs.
export function readSkill(dir) {
  const dirName = dir.split("/").pop();
  const skill = { dir, dirName, frontmatter: null, body: "", raw: "", openaiYaml: null, errors: [] };

  if (!lstatSync(dir).isDirectory()) {
    skill.errors.push("is not a directory; skills/ may only contain skill directories");
    return skill;
  }
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) {
    skill.errors.push("has no SKILL.md");
    return skill;
  }

  skill.raw = readFileSync(skillMd, "utf8");
  const parts = splitFrontmatter(skill.raw);
  if (!parts) {
    skill.errors.push("SKILL.md has no YAML frontmatter block");
    return skill;
  }
  skill.body = parts.body;
  try {
    const data = parseYaml(parts.yaml);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      skill.errors.push("SKILL.md frontmatter is not a YAML mapping");
    } else {
      skill.frontmatter = data;
    }
  } catch (error) {
    skill.errors.push(`SKILL.md frontmatter is not valid YAML: ${error.message.split("\n")[0]}`);
  }

  const openaiPath = join(dir, "agents", "openai.yaml");
  if (existsSync(openaiPath)) {
    try {
      skill.openaiYaml = parseYaml(readFileSync(openaiPath, "utf8")) ?? {};
    } catch (error) {
      skill.errors.push(`agents/openai.yaml is not valid YAML: ${error.message.split("\n")[0]}`);
    }
  }
  return skill;
}

export function isUserInvoked(skill) {
  return skill.frontmatter?.["disable-model-invocation"] === true;
}

export function readSkills(root) {
  return listSkillDirs(root).map(readSkill);
}
