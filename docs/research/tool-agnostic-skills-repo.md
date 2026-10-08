# How tool-agnostic agent-skills repos are set up

Research date: 2026-10-08. Repos read at these commits (shallow clones):

- `cursor/plugins` at `ccb5507` (2026-10-07)
- `mattpocock/skills` at `b0618bc` (2026-10-08)
- `vercel-labs/skills` at `05bf938` (2026-10-08)

GitHub links below point at `main`, so line anchors can drift from these commits.

Labels used in this doc:

- **[verified]**: read in a primary source and linked.
- **[local]**: observed on this machine under `~/.claude/plugins/` or `~/claude-plugins/`.
- **[inference]**: my reasoning. It is not stated in any source.
- **[unverified]**: claimed by a repo but not confirmed in vendor docs, or I could not find it.

## TL;DR

- **Upstream pstack is not tool-agnostic.** It is a Cursor-only plugin, with only `pstack/.cursor-plugin/plugin.json`. Its skills hard-code Cursor's Task-tool fields (`subagent_type: generalPurpose`, `readonly`, `environment: "cloud"`), Cursor model slugs, and a `~/.cursor/rules/pstack-models.mdc` config. The root `.claude-plugin/marketplace.json` in `cursor/plugins` lists only `origin-apps`, not pstack.
- **Your Claude Code pstack is your own port.** It is the `local-plugins` marketplace at `/Users/segov/claude-plugins`. A regex script, `port-pstack.py`, built it, and you edited some files by hand. The `opencode-panel` skill, the `opencode-runner` agent, and `~/.claude/rules/pstack-models.md` exist only in that port. Upstream has none of them. [local]
- **mattpocock/skills is the tool-agnostic model to copy.** It has:
  - One source tree of `SKILL.md` files, grouped in buckets: `skills/<bucket>/<name>/`.
  - One Claude-format manifest pair, `.claude-plugin/{plugin.json,marketplace.json}`. Codex and Copilot read this pair too.
  - A per-skill `agents/openai.yaml` sidecar for Codex.
  - `npx skills` (skills.sh) as the fallback installer for every other agent.
  - Neutral wording in skill text, such as "Call the Skill tool with …" and "sub-agent". It names no harness tools.
  - A changesets release flow, plus a script that syncs `package.json`'s version into `plugin.json`.
- **Codex reads Claude and Cursor manifests natively.** It discovers plugin manifests in this order:
  1. Root `plugin.json`, used only when it declares an Agent Plugins `$schema`.
  2. `.codex-plugin/plugin.json`.
  3. `.claude-plugin/plugin.json`.
  4. `.cursor-plugin/plugin.json`.

  It reads marketplaces from `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, or `.cursor-plugin/marketplace.json`. [verified, Codex source]
- **For a new repo, use a flat `skills/<name>/SKILL.md` layout.** The Agent Plugins spec forbids recursive skill discovery. Codex drops symlinks at install. mattpocock had to list each bucketed skill path by hand because of the bucket layout.

---

## 1. Directory layout

### cursor/plugins (multi-plugin marketplace monorepo)

[verified: [README "Repository structure"](https://github.com/cursor/plugins/blob/main/README.md)]

```
cursor/plugins/
├── .cursor-plugin/marketplace.json   # Cursor catalog: ~100 entries, incl. pstack
├── .claude-plugin/marketplace.json   # Claude catalog: ONLY origin-apps
├── .github/workflows/validate-plugins.yml
├── schemas/{plugin,marketplace}.schema.json
├── scripts/validate-plugins.mjs
├── pstack/ … dyl-stack/ … origin-apps/ …   # one dir per first-party plugin
└── third_party/<name>/               # MCP-connector plugins
```

pstack ([tree](https://github.com/cursor/plugins/tree/main/pstack)):

```
pstack/
├── .cursor-plugin/plugin.json      # the only manifest
├── agents/                         # comment-sicko.md, poteto-agent.md
├── assets/logo.png
├── automations/benny/              # dormant pack; its skills are NOT registered
│   ├── FOR_AGENTS.md, README.md, templates/
│   └── skills/{reproduce-and-fix-issues,setup-benny,triage-issue-reports}/
├── docs/guide/01-setup.md … 10-recipes-and-pitfalls.md (+ images/)
├── skills/                         # FLAT: skills/<name>/SKILL.md, 53 skills
│   ├── poteto-mode/{SKILL.md, playbooks/*.md (23), references/, scripts/ (bun/TS + tests)}
│   ├── how/{SKILL.md, references/{explorer,explainer}-prompt.md}
│   ├── why/{SKILL.md, references/sources/*.md}
│   ├── interrogate/, architect/, reflect/ (references/*-prompt.md, rubric)
│   ├── show-me-your-work/{references/decision-log-template.tsv, scripts/log.sh}
│   └── principle-*/SKILL.md         # 24 one-principle skills, a naming prefix in place of folders
├── LICENSE, README.md
```

- pstack has no `commands/`, `hooks/`, `rules/`, or `mcp.json`.
- Groups are naming prefixes (`principle-*`), not folders.
- Sibling plugins in the same repo use the other component types:
  - `continual-learning/hooks/hooks.json`
  - `advisor/hooks/*.sh`
  - `create-plugin/rules/*.mdc` and `cursor-team-kit/rules/*.mdc`

### mattpocock/skills (single-plugin repo, bucketed)

[verified: [AGENTS.md / CLAUDE.md](https://github.com/mattpocock/skills/blob/main/CLAUDE.md)]

```
mattpocock/skills/
├── .claude-plugin/{plugin.json, marketplace.json}
├── .agents/                        # maintainer docs for agents working ON the repo
│   ├── adr/0001-…md, adr/0002-ship-as-a-claude-code-plugin.md
│   ├── install-block.md            # canonical install wording
│   ├── invocation.md               # model- vs user-invoked rules
│   └── writing-docs.md
├── .changeset/                     # changesets release notes
├── .github/workflows/{release.yml, needs-info.yml, triage-label.yml}
├── .out-of-scope/*.md              # recorded "won't do" decisions
├── AGENTS.md -> CLAUDE.md          # symlink: one instruction file for both
├── docs/{engineering,productivity}/<skill>.md   # human docs mirror the promoted buckets
├── scripts/{link-skills.sh, list-skills.sh, sync-plugin-version.mjs}
├── skills/
│   ├── engineering/<name>/         # promoted (shipped)
│   ├── productivity/<name>/        # promoted (shipped)
│   ├── misc/<name>/                # kept, not promoted
│   ├── in-progress/<name>/         # beta, public, not shipped in the plugin
│   ├── deprecated/README.md
│   └── <bucket>/README.md          # lists the bucket's skills
├── package.json (version source), GLOSSARY.md, SCOPE.md, CHANGELOG.md
```

Each skill is `skills/<bucket>/<name>/SKILL.md`, plus:

- `agents/openai.yaml`: the Codex sidecar. Every skill has one.
- Optional uppercase sibling `.md` files referenced from the skill body. Examples: `codebase-design/DEEPENING.md` and `tdd/mocking.md`.
- Optional `scripts/`. Example: `diagnosing-bugs/scripts/hitl-loop.template.sh`.

## 2. Plugin manifests

### Claude Code: mattpocock

[`.claude-plugin/plugin.json`](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json), abridged (27 skill paths):

```json
{
  "name": "mattpocock-skills",
  "version": "1.3.1",
  "description": "Matt Pocock's agent skills for real engineering: …",
  "author": { "name": "Matt Pocock", "url": "https://www.aihero.dev" },
  "homepage": "https://www.aihero.dev/s/skills-newsletter",
  "repository": "https://github.com/mattpocock/skills",
  "license": "MIT",
  "keywords": ["engineering","skills","tdd","code-review","grilling","domain-modeling","productivity"],
  "skills": [
    "./skills/engineering/ask-matt",
    "./skills/engineering/diagnosing-bugs",
    "…",
    "./skills/productivity/writing-for-agents"
  ]
}
```

[`.claude-plugin/marketplace.json`](https://github.com/mattpocock/skills/blob/main/.claude-plugin/marketplace.json): the repo is its own one-plugin marketplace, with `source: "./"`.

```json
{
  "name": "mattpocock",
  "owner": { "name": "Matt Pocock", "url": "https://www.aihero.dev" },
  "description": "Matt Pocock's skills for real engineering, as an installable Claude Code plugin.",
  "plugins": [{
    "name": "mattpocock-skills", "source": "./",
    "description": "…", "category": "engineering",
    "keywords": ["engineering","skills","tdd","code-review","grilling"]
  }]
}
```

How the skill paths and versions work:

- **The skills array curates the shipped set.** The array lists skill directories one by one. That curates the promoted subset out of a bucketed tree. ([ADR 0002](https://github.com/mattpocock/skills/blob/main/.agents/adr/0002-ship-as-a-claude-code-plugin.md))
- **Claude Code's `skills` key adds to the default scan.** It takes a path or an array. "Directories to scan for skills, each a directory of `<name>/SKILL.md` folders or one folder holding `SKILL.md` directly … Adds to the default `skills/` scan." ([Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)). By contrast, `commands`, `agents`, and `outputStyles` *replace* their default folders.
- **Versioning:** `package.json` is the source of truth. `npm run version` runs `changeset version && node scripts/sync-plugin-version.mjs`, which rewrites only the `"version"` line in `plugin.json`. CI can run it in `--check` mode. ([script](https://github.com/mattpocock/skills/blob/main/scripts/sync-plugin-version.mjs), [package.json](https://github.com/mattpocock/skills/blob/main/package.json), [release.yml](https://github.com/mattpocock/skills/blob/main/.github/workflows/release.yml)). `marketplace.json` has no `version`, "so it can't drift" (ADR 0002, 2026-10-08 update).
- **Claude version semantics:** the manifest `version` wins over the marketplace entry's `version`. "A manifest that pins `"version": "1.0.0"` keeps every user on the cached copy until its author changes the string." With no version set, git sources use the 12-character commit SHA. ([plugin loading](https://code.claude.com/docs/en/plugins/loading))
- **Official listing.** The plugin is also listed in `claude-plugins-official`. That listing pins a SHA of this repo and reads `.claude-plugin/plugin.json` directly. (ADR 0002, 2026-08-05 update)

[local] On disk after install, Claude Code copied the *whole repo* into `~/.claude/plugins/cache/mattpocock/mattpocock-skills/1.3.1/`, including `misc/`, `in-progress/`, and `node_modules/`. It loads only the listed skills. This session's skill list shows only promoted, model-invoked skills, such as `mattpocock-skills:research`.

### Cursor: pstack

[`pstack/.cursor-plugin/plugin.json`](https://github.com/cursor/plugins/blob/main/pstack/.cursor-plugin/plugin.json):

```json
{
  "name": "pstack", "displayName": "pstack", "version": "0.15.15",
  "description": "if you want to go fast, go deep first. …",
  "author": { "name": "Lauren Tan" },
  "homepage": "https://github.com/cursor/plugins/tree/main/pstack",
  "repository": "https://github.com/cursor/plugins",
  "license": "MIT", "logo": "assets/logo.png",
  "keywords": ["pstack","poteto-mode","workflow","principles","agent-style","subagents","unslop"],
  "category": "developer-tools", "tags": ["workflow","principles","review","planning"],
  "skills": "./skills/",
  "agents": "./agents/"
}
```

Registration in [`.cursor-plugin/marketplace.json`](https://github.com/cursor/plugins/blob/main/.cursor-plugin/marketplace.json):

```json
{ "name": "pstack", "source": "pstack", "description": "if you want to go fast, go deep first. …" }
```

Marketplace top level: `{ name: "cursor-plugins", owner: {name, email}, metadata: {description}, plugins: [...] }`. Entries may also carry `minClientVersions`, for example `{"cursor":"never","grokbot":"0.49.0"}`.

Cursor manifest schema ([schemas/plugin.schema.json](https://github.com/cursor/plugins/blob/main/schemas/plugin.schema.json), `additionalProperties: false`):

- **Required:** `name` (kebab-case).
- **Optional metadata:** `displayName`, `description`, `version`, `minClientVersions`, `author{name,email}`, `publisher`, `homepage`, `repository`, `license`, `logo`, `keywords`, `category`, `tags`.
- **Components:** `commands`, `agents`, `skills`, and `rules` each take a string or a string array of globs or paths. `hooks` takes a path or an inline object. `mcpServers` takes a path, an object, or an array. `variables` takes a JSON Schema for user config.

[Cursor plugin docs](https://cursor.com/docs/plugins) add these details:

- Default component folders are `rules/`, `skills/`, `agents/`, `commands/`, `hooks/`, and `mcp.json`.
- `.cursor-plugin/marketplace.json` serves multi-plugin repos.
- Plugin paths use `${CURSOR_PLUGIN_ROOT}`. Cursor does not expand the standard's `${PLUGIN_ROOT}`.
- For local testing, put the plugin in `~/.cursor/plugins/local` and run "Developer: Reload Window".

CI ([validate-plugins.mjs](https://github.com/cursor/plugins/blob/main/scripts/validate-plugins.mjs), [workflow](https://github.com/cursor/plugins/blob/main/.github/workflows/validate-plugins.yml)) uses ajv to validate the marketplace and each `<source>/.cursor-plugin/plugin.json` against the schemas. It also checks that the source directory exists and that the entry name equals `plugin.json`'s `name`.

### Cross-tool example inside cursor/plugins: origin-apps

`origin-apps` ships three manifests side by side. Its README says it "runs in Cursor, Claude Code, Codex, and any agent that reads Agent Skills" ([README](https://github.com/cursor/plugins/blob/main/origin-apps/README.md)). The manifests:

- **[`origin-apps/plugin.json`](https://github.com/cursor/plugins/blob/main/origin-apps/plugin.json)** (Agent Plugins standard): `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`, plus name, version, description, author, homepage, repository, license, and keywords. It has no component keys.
- **[`origin-apps/.claude-plugin/plugin.json`](https://github.com/cursor/plugins/blob/main/origin-apps/.claude-plugin/plugin.json)**: the same metadata plus `"skills": "./skills/"`.
- **[`origin-apps/.cursor-plugin/plugin.json`](https://github.com/cursor/plugins/blob/main/origin-apps/.cursor-plugin/plugin.json)**: the same metadata plus `displayName`, `category`, `tags`, and `"skills": "./skills/"`.

The repo-root [`.claude-plugin/marketplace.json`](https://github.com/cursor/plugins/blob/main/.claude-plugin/marketplace.json) lists only `{ "name": "origin-apps", "source": "./origin-apps" }`.

### Agent Plugins open standard (root `plugin.json`)

[verified: [spec 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md), [schema](https://github.com/agentplugins/agent-plugins-spec/blob/main/schemas/1.0.0/plugin.schema.json)]

- The schema requires `$schema` and `name`. Its other properties are `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `extensions`.
- The manifest cannot declare component paths: "Clients MUST discover each supported component type from its fixed location. `plugin.json` cannot override these locations".
- Components are `skills/` and `mcp.json` only.
- "Each immediate child directory [of `skills/`] containing … `SKILL.md` … is treated as one skill. Clients MUST NOT recursively search deeper descendants." **So bucketed layouts are invalid under this standard.**
- MCP stdio configs expand `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`. Symlinks may resolve only inside the plugin root.

### Codex

[verified, Codex source]

- **Manifest discovery.** [`plugin_namespace.rs`](https://github.com/openai/codex/blob/main/codex-rs/utils/plugins/src/plugin_namespace.rs) tries root `plugin.json` first, used only if its `$schema` starts with `https://agent-plugins.org/schemas/`. It then tries `DISCOVERABLE_PLUGIN_MANIFEST_PATHS = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"]`, defined in [`exec-server-protocol/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/exec-server-protocol/src/lib.rs).
- **Marketplace discovery.** [`core-plugins/src/marketplace.rs`](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/marketplace.rs): `MARKETPLACE_MANIFEST_RELATIVE_PATHS = [".agents/plugins/marketplace.json", ".agents/plugins/api_marketplace.json", ".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json"]`.
- **Legacy manifest fields.** In [`core-plugins/src/manifest.rs`](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manifest.rs) the fields are `name`, `version`, `description`, `keywords`, `skills` (a `./` path or an array of paths), `mcpServers`, `apps`, `hooks`, `interface`, and `extensions`. **There is no `agents` key.** [inference: Codex plugins can't ship subagents]
- **Hooks.** Plugins can ship hooks in `hooks/hooks.json` or through the manifest `hooks` key. "Codex skips plugin-bundled hooks until you review and trust the current hook definition." ([Codex hooks docs](https://learn.chatgpt.com/docs/hooks))
- **Install behavior, per mattpocock's testing.** On Codex 0.161.0, Codex "accepts a `skills` string array and falls back to `.claude-plugin/`… Codex still drops symlinks." (ADR 0002, 2026-10-07 update)
- [unverified] I couldn't fetch the Codex "build plugins" docs page for the `.codex-plugin/plugin.json` field reference. It redirects to a ChatGPT plugin-creator page.

### opencode

opencode has no skills-plugin manifest. Its "plugins" are JS/TS modules that return hooks and tools, loaded from `.opencode/plugins/`, `~/.config/opencode/plugins/`, or npm packages listed under `"plugin"` in `opencode.json`. The docs mention no marketplace and no way to ship skills, agents, or commands through a plugin. ([opencode plugins](https://opencode.ai/docs/plugins/))

Skills reach opencode through its skill directories (section 5).

## 3. SKILL.md format

### Agent Skills spec fields (portable)

[verified: [agentskills.io/specification](https://agentskills.io/specification)]

| Field | Required | Constraint |
|---|---|---|
| `name` | yes | ≤64 chars, `[a-z0-9-]`, no leading, trailing, or double hyphen, **must match the parent directory name** |
| `description` | yes | ≤1024 chars. Says what the skill does and when to use it |
| `license` | no | Name or bundled file |
| `compatibility` | no | ≤500 chars of environment requirements |
| `metadata` | no | string→string map |
| `allowed-tools` | no | Space-separated. Experimental, and support varies |

Spec guidance on structure:

- Optional directories are `scripts/`, `references/`, and `assets/`.
- File references use "relative paths from the skill root… one level deep".
- Keep `SKILL.md` under 500 lines and under about 5000 tokens.
- Validate with `skills-ref validate ./my-skill`.

The client guide says clients should scan `.agents/skills/` at project and user level "for cross-client interoperability", and that some also scan `.claude/skills/`. It also suggests hiding skills marked `disable-model-invocation` from the catalog. ([client guide](https://agentskills.io/client-implementation/adding-skills-support.md))

### Tool-specific fields

| Field | Claude Code | Cursor | Codex | opencode |
|---|---|---|---|---|
| `disable-model-invocation` | yes | yes | no; uses `agents/openai.yaml` `policy.allow_implicit_invocation: false` | not listed |
| `user-invocable` | yes | not listed | — | — |
| `paths` (globs) | yes | yes | — | — |
| `argument-hint`, `arguments`, `when_to_use`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `shell`, `disallowed-tools` | yes | — | — | — |
| `icon`, `color` (Custom Mode badge) | — | yes | `openai.yaml` `interface` has icons and brand color | — |

Sources: [Claude skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [opencode skills](https://opencode.ai/docs/skills/).

- opencode recognizes only `name`, `description`, `license`, `compatibility`, and `metadata`.
- Claude substitutes `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, and `$ARGUMENTS` in skill bodies. Those placeholders are not portable.
- The vercel-labs [compatibility table](https://github.com/vercel-labs/skills/blob/main/README.md#compatibility) shows `context: fork` working in Claude Code only.

### What each repo uses

| | pstack (upstream) | mattpocock |
|---|---|---|
| `name`, `description` | all 56 skill and agent files | all 38 skills |
| `disable-model-invocation: true` | 53 files. Every skill except `setup-pstack` is user-only in Cursor | 23 skills, the "user-invoked" set |
| `paths` | `typescript-best-practices`: `["**/*.ts","**/*.tsx"]` | — |
| `argument-hint` | — | 4 |
| `metadata` | — | 1 (`pr`: credits) |
| Cursor-only extras | `poteto-mode`: `mode: true`, `icon: crown`, `color: yellow`, `reminder: …` [`mode`/`reminder` unverified: not in Cursor's skills doc]. The `name: Poteto Mode` value breaks the spec's naming rule | none |

- **mattpocock: invocation is mirrored per harness.** A user-invoked skill sets `disable-model-invocation: true` in `SKILL.md` *and* `policy.allow_implicit_invocation: false` in `agents/openai.yaml`. "Keep the two in sync: a skill is user-invoked in both harnesses or neither." ([invocation.md](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md)). Example sidecars:

  ```yaml
  # skills/engineering/to-spec/agents/openai.yaml (user-invoked)
  interface:
    display_name: "To Spec"
    short_description: "Turn a conversation into a spec"
  policy:
    allow_implicit_invocation: false
  ```

  ```yaml
  # skills/engineering/research/agents/openai.yaml (model-invoked)
  interface:
    display_name: "Research"
    short_description: "Research from high-trust sources"
  ```

- **mattpocock: descriptions follow invocation.** A user-invoked skill gets a human-facing one-liner. A model-invoked skill keeps rich trigger phrasing. ([invocation.md](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md))
- **Supporting files.**
  - mattpocock puts flat sibling files in the skill folder and links them with relative Markdown links, such as `see [DEEPENING.md](DEEPENING.md)`.
  - pstack uses `references/`, `scripts/`, and a custom `playbooks/`, cited inline with relative paths, such as "Read `references/reviewer-prompt.md`" and "`scripts/log.sh <logfile> …`".
  - Both stay within the spec's "relative to skill root" rule.

## 4. Agents, commands, hooks, rules

| Component | pstack | mattpocock | Portability |
|---|---|---|---|
| Subagents | `agents/*.md` (comment-sicko, poteto-agent). Frontmatter is `name` + `description` (+ `is_background: true`) | None. Skills say "spawn … sub-agents" in prose | Low (see below) |
| Commands | None. Skills double as `/commands` | None | Claude merged commands into skills. Cursor and opencode still have command folders |
| Hooks | None in pstack. Sibling plugins use Cursor `hooks.json` `{version:1, hooks:{stop:[{command:"bun run ${CURSOR_PLUGIN_ROOT}/…"}]}}` ([continual-learning](https://github.com/cursor/plugins/blob/main/continual-learning/hooks/hooks.json)) | None. `misc/git-guardrails-claude-code` is a *skill* that installs a Claude hook script | Low |
| Rules | Model config written by `/setup-pstack` as an always-applied Cursor rule `~/.cursor/rules/pstack-models.mdc` (`alwaysApply: true`). Siblings ship `rules/*.mdc` | `AGENTS.md -> CLAUDE.md` symlink, for maintainers only | Low |

Subagent formats per tool:

- **Claude** reads `agents/*.md` from plugins, `.claude/agents/`, and `~/.claude/agents/`. Frontmatter includes `tools`, `model` (`sonnet`, `opus`, `haiku`, `fable`, `inherit`, or a full ID), `effort`, `isolation: worktree`, `skills`, and more. Plugin agents ignore `hooks`, `mcpServers`, and `permissionMode`, and are namespaced `plugin:agent`. ([Claude sub-agents](https://code.claude.com/docs/en/sub-agents))
- **Cursor** reads `.cursor/agents/`, `.claude/agents/`, and `.codex/agents/`, plus the `~/` equivalents. Fields are `name`, `description`, `model` (`inherit` or a Cursor model ID like `claude-opus-5[effort=high]`), `readonly`, and `is_background`. The parent spawns them with Task tool calls. ([Cursor subagents](https://cursor.com/docs/subagents))
- **Codex** uses TOML files in `.codex/agents/` or `~/.codex/agents/` with `name`, `description`, `developer_instructions`, and optional `model` and `model_reasoning_effort`. Plugins have no agents key. ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents))
- **opencode** uses Markdown in `.opencode/agents/` or `~/.config/opencode/agents/` with `description`, `mode: subagent|primary|all`, `model: provider/model-id`, and `permission`. Its docs don't mention reading `.claude/agents`. ([opencode agents](https://opencode.ai/docs/agents/))

Hooks and rules per tool:

- **Hooks.**
  - Claude uses `hooks/hooks.json` with PascalCase events and `${CLAUDE_PLUGIN_ROOT}`.
  - Cursor uses `{version:1}` with camelCase events. With "Third-Party Imports" on (the default), it also loads Claude hooks from `.claude/settings*.json` and `~/.claude/settings.json` and maps their events, for example `PreToolUse→preToolUse` and `UserPromptSubmit→beforeSubmitPrompt`. ([Cursor third-party hooks](https://cursor.com/docs/reference/third-party-hooks))
  - Codex uses `hooks.json` or `[hooks]` in `config.toml`.
  - opencode uses JS plugins.
- **Rules and instructions.**
  - Cursor uses `.mdc` with `description`, `globs`, and `alwaysApply`, and also reads `AGENTS.md`. ([Cursor rules](https://cursor.com/docs/rules))
  - opencode reads `AGENTS.md`, falls back to `CLAUDE.md`, and reads `~/.claude/CLAUDE.md`. ([opencode rules](https://opencode.ai/docs/rules/))
  - Claude ignores a `CLAUDE.md` inside a plugin and warns about it. ([manifest reference](https://code.claude.com/docs/en/plugins-reference))

## 5. Install methods (exact commands)

**mattpocock/skills** ([README](https://github.com/mattpocock/skills/blob/main/README.md), canonical source [install-block.md](https://github.com/mattpocock/skills/blob/main/.agents/install-block.md)):

```bash
# Claude Code (official marketplace; auto-updates)
claude plugin install mattpocock-skills@claude-plugins-official
# Codex (repo's own .claude-plugin/marketplace.json; updates at startup)
codex plugin marketplace add mattpocock/skills
codex plugin add mattpocock-skills@mattpocock
# GitHub Copilot CLI
copilot plugin marketplace add mattpocock/skills
copilot plugin install mattpocock-skills@mattpocock
# Gemini CLI (copies; one install per bucket)
gemini skills install https://github.com/mattpocock/skills.git --path skills/engineering
gemini skills install https://github.com/mattpocock/skills.git --path skills/productivity
# Everyone else (cursor, opencode, devin, windsurf, amp, pi)
npx skills@latest add mattpocock/skills -a <agent>
npx skills@latest add mattpocock/skills --skill=<name>
npx skills@latest update
```

Two notes from install-block.md:

- "The two routes are exclusive… Installing both leaves the user with every skill twice: always say 'pick one'."
- Managed routes "reinstall only when the `version` in `plugin.json` changes."

Before the official listing, the Claude route was `/plugin marketplace add mattpocock/skills` and then `/plugin install mattpocock-skills@mattpocock`. ADR 0002 marks that path superseded. [local] Your machine still uses it: `known_marketplaces.json` has `mattpocock` → `github mattpocock/skills`.

**Maintainer symlink install** ([link-skills.sh](https://github.com/mattpocock/skills/blob/main/scripts/link-skills.sh)) links every non-`deprecated/`, non-`misc/` skill as `~/.claude/skills/<name>` and `~/.agents/skills/<name>`, so "a `git pull` keeps installed skills current". It flattens buckets by basename. Its header says it is a dev-only script, not a supported installer.

**pstack** ([README](https://github.com/cursor/plugins/blob/main/pstack/README.md)): `/add-plugin pstack` in Cursor. The [Cursor plugin docs](https://cursor.com/docs/plugins) say you can also install from the Marketplace, from Customize in the sidebar, or from team marketplaces. [unverified] I didn't find a documented Cursor command for adding an arbitrary GitHub repo as a marketplace.

Upstream offers no Claude, Codex, or opencode route for pstack. From the Codex source, `codex plugin marketplace add cursor/plugins` should read `.cursor-plugin/marketplace.json` and then `pstack/.cursor-plugin/plugin.json` [inference]. The skill text would still be Cursor-specific.

**Claude Code generic** ([marketplaces doc](https://code.claude.com/docs/en/plugin-marketplaces)):

```bash
claude plugin marketplace add <owner>/<repo>     # or ./local-dir
claude plugin install <plugin>@<marketplace>
/plugin marketplace add <owner>/<repo>           # in-session equivalents
/plugin install <plugin>@<marketplace>
claude plugin validate . --strict                # mattpocock runs this after manifest edits
claude --plugin-dir ./my-plugin                  # load in place for dev
```

**`npx skills`** ([vercel-labs/skills README](https://github.com/vercel-labs/skills/blob/main/README.md)):

- **Commands:** `npx skills add <owner/repo | URL | ./path> [-g] [-a <agent>…] [--skill <name>…] [--copy] [-y] [--list]`, plus `list`, `find`, `update`, `remove`, `init`, and `use`.
- **Discovery:** it walks `skills/` (and many `.<agent>/skills/` dirs) up to 3 levels: `skills/<name>`, `skills/<cat>/<name>`, and `skills/<cat>/<cat>/<name>`.
- **Manifest discovery:** it also honors `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` `skills` arrays ([plugin-manifest.ts](https://github.com/vercel-labs/skills/blob/main/src/plugin-manifest.ts)).
- **Install method:** symlinks from a canonical copy by default, or copies with `--copy`.
- **Agent targets:** `claude-code` → `.claude/skills/` and `~/.claude/skills/`. `codex` → `.agents/skills/` and `~/.agents/skills/`. `cursor` → `.agents/skills/` and `~/.cursor/skills/`. `opencode` → `.agents/skills/` and `~/.config/opencode/skills/`.
- **Hidden skills:** `metadata.internal: true` hides a skill unless `INSTALL_INTERNAL_SKILLS=1` is set.

**Native skill directories, for manual copy or symlink:**

- **Claude Code:** `~/.claude/skills/`, `.claude/skills/` (walks up to the repo root). A folder with `.claude-plugin/plugin.json` under a skills dir loads as a `@skills-dir` plugin. ([skills](https://code.claude.com/docs/en/skills), [loading](https://code.claude.com/docs/en/plugins/loading))
- **Cursor:** `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`, plus the legacy `.claude/skills/` and `.codex/skills/` and their `~/` versions. ([Cursor skills](https://cursor.com/docs/skills))
- **Codex:** `.agents/skills` from the current directory up to the repo root, `~/.agents/skills`, and `/etc/codex/skills`. ([Codex skills](https://learn.chatgpt.com/docs/build-skills))
- **opencode:** `.opencode/skills/`, `~/.config/opencode/skills/`, `.claude/skills/`, `~/.claude/skills/`, `.agents/skills/`, and `~/.agents/skills/`. ([opencode skills](https://opencode.ai/docs/skills/))

**Result: `~/.agents/skills/<name>` reaches Cursor, Codex, and opencode. `~/.claude/skills/<name>` reaches Claude Code, Cursor (legacy), and opencode.**

## 6. How each repo stays (or doesn't stay) tool-agnostic

### mattpocock/skills (agnostic by design)

1. **One source of truth.** Every harness reads the same `skills/<bucket>/<name>/SKILL.md`. There is no build step and no generated copy.
2. **Thin manifests, reused across vendors.** Only `.claude-plugin/` exists. Codex and Copilot read it through their fallbacks. Gemini installs by `--path`, and everyone else uses skills.sh, which also reads `.claude-plugin/plugin.json`.
3. **Per-harness sidecars only where needed.** `agents/openai.yaml` sits next to each `SKILL.md`, with an invariant that keeps it in sync with `disable-model-invocation`.
4. **Neutral wording in skill text.**
   - To call another skill, a skill says "Call the Skill tool with "grilling"" rather than writing `/grilling` or `../other/FILE.md`. invocation.md explains: "Dropping the leading `/` also keeps this harness-neutral."
   - Subagents are described in prose ("Spawn both sub-agents in parallel"), with no tool name, `subagent_type`, or model. ([code-review SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md))
   - The repo refuses harness-specific UI. [native-question-tool.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md): "The skills are harness-neutral text… Naming one harness's tool in the skill means either a harness-specific branch in every grilling skill, or a skill that only works properly in one place." Per-user preferences go in your own `CLAUDE.md` or `AGENTS.md`.
   - No recursion guards ([subagent-recursion.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/subagent-recursion.md)).
   - No renames to dodge harness built-ins. Users invoke by namespace, for example `/mattpocock-skills:research` ([harness-name-collisions.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/harness-name-collisions.md)).
5. **Versioning and release.** changesets, then `npm run version`, then `sync-plugin-version.mjs`, then a "chore: version skills" PR through [release.yml](https://github.com/mattpocock/skills/blob/main/.github/workflows/release.yml). There is no schema-validation CI. The only manual check is `claude plugin validate . --strict`.
6. **Invariants live in `AGENTS.md`, not in tooling.** Each promoted skill must appear in the README and in `plugin.json` `skills`, have a bucket README entry and a docs page, and be in the `ask-matt` router. The repo bans em-dashes. Agents maintain these rules by reading `AGENTS.md`.
7. **Bucketing is the one portability cost.** Only Claude-style manifests can curate a subset with path arrays. Codex dropped symlinks, and before October 2026 it rejected arrays. The Agent Plugins spec forbids nesting. Gemini needs one install per bucket. (ADR 0002)

### pstack (Cursor-native; not agnostic)

- **Cursor manifest only**, and the skill text is Cursor-specific:
  - Subagent spawns specify `subagent_type: generalPurpose`, `readonly: true`, `run_in_background: true`, and `environment: "cloud"` ([swarm SKILL.md](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md)).
  - Skills name "the Task tool" and `AskQuestion`, and they glob `agent-transcripts/` and `~/.cursor/projects/`.
- **Model routing pattern, worth copying conceptually.**
  - `/setup-pstack` writes one always-applied rule, `~/.cursor/rules/pstack-models.mdc`, with one `role: model` line per role, such as `arena runners: claude-opus-5-5-xhigh, grok-4.7-xhigh-fast`. ([setup-pstack SKILL.md](https://github.com/cursor/plugins/blob/main/pstack/skills/setup-pstack/SKILL.md))
  - Every spawning skill says "Set `model` to that line's value, or to the default if the rule or the line is missing", with `inherit-parent`/`auto` meaning omit `model` ([how SKILL.md](https://github.com/cursor/plugins/blob/main/pstack/skills/how/SKILL.md)).
  - Panels are lists, and the list length sets the fan-out.
  - So the model choice lives in user config, not in skill text. The *mechanism* (an always-applied rule) and the *slugs* are Cursor-specific.
- **Grouping by name prefix** (`principle-*`) instead of folders keeps `skills/` flat.

### Your local Claude port of pstack

[local: `/Users/segov/claude-plugins/`]

- **Structure.** `.claude-plugin/marketplace.json` names `local-plugins` with one entry, `pstack` at `source: "./pstack"`. `pstack/.claude-plugin/plugin.json` sets version `0.15.15-claude.1` and declares no component keys, so it uses the default `skills/` and `agents/` folders. `known_marketplaces.json` registers it as a `directory` source, so it loads in place.
- **`port-pstack.py` rewrites the text mechanically.**
  - Models: `claude-opus-5-5-xhigh`→`opus`, `grok-…-fast`→`sonnet`.
  - Spawn fields: `generalPurpose`+`readonly`→`Explore`, Task→Agent, `AskQuestion`→`AskUserQuestion`, and `subagent_type: "pstack:comment-sicko"`.
  - Paths: `.cursor/…`→`.claude/…`, and `pstack-models.mdc`→`~/.claude/rules/pstack-models.md`.
  - Frontmatter: drops `mode`, `icon`, `color`, `reminder`, and `is_background`. Removes `disable-model-invocation` from non-principle, non-user-only skills "so poteto-mode … can route to it through the Skill tool".
  - It prints leftover Cursor references for hand edits. `port.log` shows many remain in docs, `why`, `swarm`, and `setup-pstack`.
- **The opencode bridge.** It is a skill plus an agent:
  - In the config, a role value containing `/` (for example `opencode-go/grok-4.7`) is an opencode slug.
  - The parent spawns a Claude `pstack:opencode-runner` subagent (`model: sonnet`, `tools: Bash, Read, Write, Glob, Grep`). That subagent pilots the `opencode` CLI with `MODEL`, `MODE`, `SCRIPT`, `WORKDIR`, `OUTPUT`, and `BRIEF`.
  - The `opencode-panel` skill is `user-invocable: false`, so the model can load it but users can't type it.
- **This is a fork, not a single source.** Every upstream pstack update has to be re-ported.

## Comparison table

| | pstack (cursor/plugins) | mattpocock/skills |
|---|---|---|
| Repo shape | One plugin dir inside a 100-plugin marketplace monorepo | Repo root is the plugin, and it is its own marketplace (`source: "./"`) |
| Skill layout | Flat `skills/<name>/`. Groups by name prefix (`principle-*`) | Bucketed `skills/<bucket>/<name>/`. Buckets gate what ships |
| Manifests | `.cursor-plugin/plugin.json` only, registered in root `.cursor-plugin/marketplace.json` | `.claude-plugin/plugin.json` + `marketplace.json`. Codex and Copilot read them too |
| Skill selection | `"skills": "./skills/"` (everything) | Explicit array of 27 paths |
| Other components | `agents/` (2), docs, a dormant automations pack | None. Per-skill `agents/openai.yaml` |
| Frontmatter | name, description, `disable-model-invocation` (nearly all), `paths`, Cursor mode fields | name, description, `disable-model-invocation`, `argument-hint`, `metadata` |
| Cross-skill calls | "Read the leaf skill", "per the X principle skill" | "Call the Skill tool with "X"" |
| Subagent wording | Cursor Task fields (`subagent_type`, `readonly`, `environment`, `model` slugs) | Prose only ("parallel sub-agents") |
| Model selection | User rule file `pstack-models.mdc`, one role per line, with skill defaults | None. "Work with any model" |
| Versioning | Hand-edited `version` in plugin.json (0.15.15) | changesets → `package.json` → `sync-plugin-version.mjs` → plugin.json |
| CI | Repo-wide ajv schema validation and a name-match check | Release PR only. `claude plugin validate --strict` run by hand |
| Install | Cursor: `/add-plugin pstack` | Claude official marketplace, Codex and Copilot marketplace, Gemini `--path`, `npx skills` |
| Dev loop | Cursor: `~/.cursor/plugins/local` | `scripts/link-skills.sh` symlinks into `~/.claude/skills` and `~/.agents/skills` |
| Tool-agnostic? | No (Cursor-only text and manifest) | Yes (neutral text plus vendor fallbacks) |

---

## 7. Recommendation for segov-stack

Tags in this section:

- **[copied]**: a pattern one of the repos uses.
- **[inference]**: my design choice, derived from the sources but not done by either repo.

### Layout

```
segov-stack/
├── .claude-plugin/
│   ├── plugin.json            # [copied mattpocock] Claude, and Codex/Copilot fallback, and npx-skills discovery
│   └── marketplace.json       # [copied mattpocock] repo = its own marketplace, source "./"
├── .cursor-plugin/
│   └── plugin.json            # [copied origin-apps] Cursor manifest; same metadata + displayName/category
├── plugin.json                # OPTIONAL [copied origin-apps] Agent Plugins 1.0.0 root manifest (see caveat)
├── skills/                    # FLAT [copied pstack/origin-apps] skills/<name>/SKILL.md
│   └── <name>/
│       ├── SKILL.md           # portable frontmatter only (+ disable-model-invocation where needed)
│       ├── agents/openai.yaml # [copied mattpocock] Codex display + implicit-invocation policy
│       ├── references/*.md    # [copied pstack] on-demand docs, linked relatively
│       └── scripts/*          # [copied pstack] referenced relative to skill root
├── agents/                    # [copied pstack] Claude/Cursor-compatible subagent .md (name, description, model?)
├── catalog/                   # [inference] optional: non-shipped skills (drafts) kept OUT of skills/
│   └── in-progress/<name>/SKILL.md
├── scripts/
│   ├── link-skills.sh         # [copied mattpocock] dev symlinks into ~/.claude/skills and ~/.agents/skills
│   ├── sync-version.mjs       # [copied+extended mattpocock] package.json version -> every plugin.json
│   └── validate.mjs           # [copied cursor/plugins idea] lint frontmatter, name==dir, sidecar sync, manifest parity
├── .github/workflows/validate.yml  # [copied cursor/plugins] run validate.mjs + `claude plugin validate . --strict`
├── .changeset/ + package.json # [copied mattpocock] version source of truth
├── AGENTS.md                  # [copied mattpocock] repo invariants for agents editing the repo
├── CLAUDE.md -> AGENTS.md     # [copied mattpocock] (they symlink the other way; either works)
└── docs/research/…
```

Why flat `skills/`:

- The Agent Plugins spec forbids nested discovery.
- Codex drops symlinks, so a flattened symlink view won't install.
- A flat directory needs no path list. `"skills": "./skills/"` works the same for Claude, Cursor, and Codex.

To keep drafts out of the shipped set, put them outside `skills/` (the `catalog/` dir above) instead of in buckets [inference]. That matches option (a) in mattpocock's ADR, which he called the "only robust" way to give Codex a single promoted-only path. If you want grouping anyway, use name prefixes as pstack does (`review-*`, `principle-*`) [copied pstack].

### Manifest skeletons

`.claude-plugin/plugin.json` [copied, mattpocock and origin-apps shape]:

```json
{
  "name": "segov-stack",
  "version": "0.1.0",
  "description": "…",
  "author": { "name": "Jonathan Segovia" },
  "repository": "https://github.com/<you>/segov-stack",
  "license": "MIT",
  "keywords": ["skills"],
  "skills": "./skills/",
  "agents": ["./agents/<agent>.md"]
}
```

- `agents` is optional. It *replaces* the default `agents/` scan and takes `.md` files, not directories. Omit it and Claude scans `agents/` anyway.
- Claude rejects plugin names that start with `claude-` and warns on names containing `claude`. `segov-stack` is fine.
- Run `claude plugin validate . --strict`.

`.claude-plugin/marketplace.json` [copied mattpocock]:

```json
{
  "name": "segov",
  "owner": { "name": "Jonathan Segovia" },
  "description": "segov-stack skills",
  "plugins": [{ "name": "segov-stack", "source": "./", "description": "…" }]
}
```

- The entry name must equal the manifest name.
- Leave `version` out of the marketplace entry. `plugin.json`'s `version` wins anyway.

`.cursor-plugin/plugin.json` [copied pstack and origin-apps]:

```json
{
  "name": "segov-stack",
  "displayName": "segov-stack",
  "version": "0.1.0",
  "description": "…",
  "author": { "name": "Jonathan Segovia" },
  "license": "MIT",
  "category": "developer-tools",
  "skills": "./skills/",
  "agents": "./agents/"
}
```

- Validate it against [cursor/plugins' schema](https://github.com/cursor/plugins/blob/main/schemas/plugin.schema.json). The schema sets `additionalProperties: false`.
- A single-plugin repo doesn't need `.cursor-plugin/marketplace.json` for local install [inference]. Add one if you want a Cursor team marketplace.

Optional root `plugin.json` [copied origin-apps]:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "segov-stack", "version": "0.1.0", "description": "…",
  "author": { "name": "Jonathan Segovia" }, "license": "MIT"
}
```

Caveat [inference from Codex source]: when this file is present, Codex uses it *instead of* `.claude-plugin/plugin.json`. Codex then discovers skills only from fixed `skills/<name>/`. That is fine with a flat layout but would break a bucketed one. Skip this file unless you target a client that needs it.

Codex sidecar per skill [copied mattpocock]:

```yaml
# skills/<name>/agents/openai.yaml
interface:
  display_name: "<Name>"
  short_description: "<one line>"
# user-invoked skills only:
policy:
  allow_implicit_invocation: false
```

No `.codex-plugin/` folder [copied mattpocock]. Codex falls back to `.claude-plugin/`. Add `.codex-plugin/plugin.json` only if you need Codex-only keys such as `apps` or `interface` [inference].

opencode needs no manifest. Users get the skills through `npx skills add <you>/segov-stack -a opencode` or `~/.agents/skills` symlinks [copied mattpocock].

### SKILL.md conventions

- **Frontmatter: [copied mattpocock]**
  - Use only `name` (equal to the folder name), `description`, and optionally `license`, `compatibility`, and `metadata`.
  - Add `disable-model-invocation: true` only for user-invoked skills, and mirror it in `openai.yaml`.
  - Avoid `context`, `model`, `allowed-tools`, `user-invocable`, Cursor `mode`, and `reminder` in shared skills.
- **Body: [copied mattpocock]**
  - Write "Call the Skill tool with "<name>"" for model-invoked dependencies. For user-invoked ones, write "Tell the user to run `/<name>`".
  - Describe subagents in prose: what to give each one, whether they run in parallel, and what they return. Name no tool and no `subagent_type`.
  - Reference files relatively (`references/x.md`). Don't use `${CLAUDE_SKILL_DIR}` or `${CLAUDE_PLUGIN_ROOT}`.
- **Model routing, the pstack pattern made neutral: [inference]**
  - Keep pstack's "one `role: model` line per role, delete a line to fall back to defaults" format.
  - Store it at a tool-neutral path, such as `~/.config/segov-stack/models.md`.
  - Have each skill say: "Read the models config if it exists. Use the line for role X. If the line or file is missing, or the value is `inherit`, use the harness default."
  - Accept harness-native values per line: `opus`/`sonnet` for Claude, Cursor slugs for Cursor, `provider/model` for opencode. Or keep your existing rule that `/` means "route through opencode" (from your port).
  - pstack depends on an always-applied rule file, which has no portable equivalent. An explicit read step works the same in every harness.
- **Agents: [inference]**
  - Ship `agents/*.md` with only `name`, `description`, and optionally `model: inherit` and `tools`. Claude and Cursor both read that shape (Cursor reads `.claude/agents/` too).
  - Codex (TOML, no plugin agents) and opencode (`.opencode/agents/`, `mode: subagent`) need generated or hand-written copies.
  - Simpler: follow mattpocock and keep subagent behavior inside skills, so you don't need agent files at all.
- **Hooks and rules: [inference]** leave them out of the portable core. If you need a hook, ship Claude's `hooks/hooks.json`. Cursor imports Claude hooks through Third-Party Imports, while Codex and opencode differ. Document a hook as optional per tool.

### Install matrix for segov-stack's README

These commands follow the vendor patterns above. I haven't run any of them against segov-stack [inference].

```bash
# Claude Code
claude plugin marketplace add <you>/segov-stack
claude plugin install segov-stack@segov
# Codex (reads .claude-plugin/marketplace.json)
codex plugin marketplace add <you>/segov-stack
codex plugin add segov-stack@segov
# Cursor: local dev = symlink/copy repo into ~/.cursor/plugins/local; or skills only:
npx skills@latest add <you>/segov-stack -a cursor
# opencode / anything else
npx skills@latest add <you>/segov-stack -a opencode
# Dev loop (maintainer): symlink skills/* into ~/.claude/skills and ~/.agents/skills
scripts/link-skills.sh
```

Warn users to pick one route per agent, because two routes install every skill twice [copied mattpocock].

### CI checks worth writing

`scripts/validate.mjs` [inference, modeled on cursor/plugins `validate-plugins.mjs` and mattpocock's invariants]:

1. Every `skills/*/SKILL.md` has a `name` equal to its folder name and matching the spec regex, and a `description` of 1024 characters or fewer.
2. Each `disable-model-invocation: true` pairs with `allow_implicit_invocation: false` in `agents/openai.yaml`, and the reverse.
3. `name`, `version`, and `description` match across all `plugin.json` files and `package.json`, run as `sync-version.mjs --check`.
4. ajv validation against the Cursor schema, and against the Agent Plugins schema if you ship a root manifest.
5. `claude plugin validate . --strict`.
6. Optional: grep skill bodies for harness-specific tokens (`subagent_type`, `Task tool`, `AskUserQuestion`, `.cursor/`, `${CLAUDE_`). This is the reverse of the leftover report in your `port-pstack.py`.

## Open / unverified points

- **Cursor and Claude plugin manifests.** Cursor's plugin docs don't say whether Cursor reads `.claude-plugin/`. Its "Third-Party Imports" setting covers "Plugins, Skills, and Other Configs", but only hooks are documented. Test it before you skip `.cursor-plugin/`.
- **Adding a GitHub repo as a Cursor marketplace.** I found no documented command for adding an arbitrary GitHub repo as a marketplace in Cursor. The `/add-plugin pstack` command comes from pstack's README.
- **Codex docs.** The Codex plugin and marketplace CLI commands come from mattpocock's README and ADR, which say they were tested on Codex 0.161.0. OpenAI's public docs pages I could reach didn't show `codex plugin marketplace add` or the `.codex-plugin/plugin.json` field reference.
- **Root `plugin.json` precedence in Codex.** The source shows the order. I haven't tested how a root `plugin.json` interacts with `.claude-plugin/` skills arrays at install time.
- **Cursor `mode` and `reminder` fields.** These pstack frontmatter fields don't appear in Cursor's skills doc.
- **`disable-model-invocation` in opencode.** opencode's docs list five recognized fields. I assume it ignores this one, which would leave user-invoked skills model-reachable there.
- **Copilot and Gemini.** Their behavior is taken from mattpocock's install-block.md and ADR only.

## Sources

**Repos (primary):**

- cursor/plugins: [README](https://github.com/cursor/plugins/blob/main/README.md) · [.cursor-plugin/marketplace.json](https://github.com/cursor/plugins/blob/main/.cursor-plugin/marketplace.json) · [.claude-plugin/marketplace.json](https://github.com/cursor/plugins/blob/main/.claude-plugin/marketplace.json) · [schemas/plugin.schema.json](https://github.com/cursor/plugins/blob/main/schemas/plugin.schema.json) · [schemas/marketplace.schema.json](https://github.com/cursor/plugins/blob/main/schemas/marketplace.schema.json) · [scripts/validate-plugins.mjs](https://github.com/cursor/plugins/blob/main/scripts/validate-plugins.mjs) · [validate-plugins.yml](https://github.com/cursor/plugins/blob/main/.github/workflows/validate-plugins.yml)
- pstack: [plugin.json](https://github.com/cursor/plugins/blob/main/pstack/.cursor-plugin/plugin.json) · [README](https://github.com/cursor/plugins/blob/main/pstack/README.md) · [setup-pstack](https://github.com/cursor/plugins/blob/main/pstack/skills/setup-pstack/SKILL.md) · [poteto-mode](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md) · [swarm](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md) · [how](https://github.com/cursor/plugins/blob/main/pstack/skills/how/SKILL.md) · [agents/](https://github.com/cursor/plugins/tree/main/pstack/agents)
- origin-apps: [plugin.json](https://github.com/cursor/plugins/blob/main/origin-apps/plugin.json) · [.claude-plugin/plugin.json](https://github.com/cursor/plugins/blob/main/origin-apps/.claude-plugin/plugin.json) · [.cursor-plugin/plugin.json](https://github.com/cursor/plugins/blob/main/origin-apps/.cursor-plugin/plugin.json) · [README](https://github.com/cursor/plugins/blob/main/origin-apps/README.md) · [continual-learning hooks.json](https://github.com/cursor/plugins/blob/main/continual-learning/hooks/hooks.json)
- mattpocock/skills: [README](https://github.com/mattpocock/skills/blob/main/README.md) · [CLAUDE.md](https://github.com/mattpocock/skills/blob/main/CLAUDE.md) · [plugin.json](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json) · [marketplace.json](https://github.com/mattpocock/skills/blob/main/.claude-plugin/marketplace.json) · [ADR 0002](https://github.com/mattpocock/skills/blob/main/.agents/adr/0002-ship-as-a-claude-code-plugin.md) · [install-block.md](https://github.com/mattpocock/skills/blob/main/.agents/install-block.md) · [invocation.md](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md) · [link-skills.sh](https://github.com/mattpocock/skills/blob/main/scripts/link-skills.sh) · [sync-plugin-version.mjs](https://github.com/mattpocock/skills/blob/main/scripts/sync-plugin-version.mjs) · [release.yml](https://github.com/mattpocock/skills/blob/main/.github/workflows/release.yml) · [native-question-tool.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md) · [subagent-recursion.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/subagent-recursion.md) · [harness-name-collisions.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/harness-name-collisions.md) · [code-review SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md)
- vercel-labs/skills: [README](https://github.com/vercel-labs/skills/blob/main/README.md) · [src/plugin-manifest.ts](https://github.com/vercel-labs/skills/blob/main/src/plugin-manifest.ts)
- openai/codex: [plugin_namespace.rs](https://github.com/openai/codex/blob/main/codex-rs/utils/plugins/src/plugin_namespace.rs) · [exec-server-protocol/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/exec-server-protocol/src/lib.rs) · [core-plugins/src/marketplace.rs](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/marketplace.rs) · [core-plugins/src/manifest.rs](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manifest.rs)
- Agent Plugins spec: [spec 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) · [plugin.schema.json](https://github.com/agentplugins/agent-plugins-spec/blob/main/schemas/1.0.0/plugin.schema.json)

**Vendor docs:**

- Agent Skills: [specification](https://agentskills.io/specification) · [client implementation guide](https://agentskills.io/client-implementation/adding-skills-support.md)
- Claude Code: [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) · [create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces) · [plugin loading](https://code.claude.com/docs/en/plugins/loading) · [skills](https://code.claude.com/docs/en/skills) · [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Cursor: [plugins](https://cursor.com/docs/plugins) · [skills](https://cursor.com/docs/skills) · [subagents](https://cursor.com/docs/subagents) · [hooks](https://cursor.com/docs/hooks) · [third-party hooks](https://cursor.com/docs/reference/third-party-hooks) · [rules](https://cursor.com/docs/rules)
- Codex (developers.openai.com redirects to learn.chatgpt.com): [skills](https://learn.chatgpt.com/docs/build-skills) · [plugins](https://learn.chatgpt.com/docs/plugins) · [hooks](https://learn.chatgpt.com/docs/hooks) · [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- opencode: [skills](https://opencode.ai/docs/skills/) · [agents](https://opencode.ai/docs/agents/) · [commands](https://opencode.ai/docs/commands/) · [plugins](https://opencode.ai/docs/plugins/) · [rules](https://opencode.ai/docs/rules/)

**Local (this machine):**

- `~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json`, `cache/mattpocock/mattpocock-skills/1.3.1/`, `cache/local-plugins/pstack/0.15.15-claude.1/`
- `/Users/segov/claude-plugins/{.claude-plugin/marketplace.json, pstack/.claude-plugin/plugin.json, port-pstack.py, port.log, pstack/skills/opencode-panel/SKILL.md, pstack/agents/opencode-runner.md}`
