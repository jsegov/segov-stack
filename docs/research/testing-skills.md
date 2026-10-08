# How to test agent skills (Claude Code, Codex, opencode)

Research date: 2026-10-08. This doc builds on [tool-agnostic-skills-repo.md](tool-agnostic-skills-repo.md) and does not repeat its layout, manifest, or install findings.

Repos read at these commits (shallow clones):

- `anthropics/skills` at `683bc88` (2026-10-05)
- `anthropics/claude-plugins-official` at `315c4e4` (2026-10-08)
- `anthropics/claude-plugins-community` at `f60f045` (2026-10-05)
- `agentskills/agentskills` at `69ef37e` (2026-08-09)
- `openai/codex` at `845345b` (2026-10-08)
- `openai/codex-action` at `bdf19a4`
- `openai/skills` at `49f948f` (2026-06-23)
- ``anomalyco/opencode` (`sst/opencode` redirects there) at tag `v2.0.22` = `527f0b9` (2026-10-02), matching the local binary, plus `dev` at `3884062` (2026-10-08, the v1.18 line)`
- `elevenlabs/skills` at `1d08a4a` (2026-10-07)
- `cursor/plugins` at `ccb5507`, `mattpocock/skills` at `b0618bc`, `vercel-labs/skills` at `05bf938` (same as the earlier doc)

Local tools: Claude Code 2.1.294 (ran `--help` and `claude plugin validate` against a throwaway fixture), opencode 2.0.22 (help commands, plus `opencode serve` + `GET /api/skill` against a scratch project; no model calls). The local `codex` binary is broken, so every Codex claim comes from source or docs.

GitHub links point at `main`, so line anchors can drift from these commits. Codex source links use the prefix `codex-rs/`, written below as `S:` = `https://github.com/openai/codex/blob/main/codex-rs/`.

Labels:

- **[verified]**: read in a primary source and linked, or observed by running the tool locally (noted as "ran locally").
- **[inference]**: my reasoning. It is not stated in any source.
- **[unverified]**: claimed somewhere but not confirmed, or I could not check it.

## TL;DR

- **There are four layers, and only the first is cheap.** Static lint (free, deterministic), discovery (free or near-free), triggering (model calls, nondeterministic), behavior (model calls, nondeterministic, needs grading).
- **No single validator covers the spec.** `claude plugin validate --strict` checks manifests and warns on a missing `description`, but it did **not** flag a `name` that differs from its directory, an uppercase directory name, or an unknown frontmatter key (`mode: true`) when I ran it [verified, ran locally]. The spec's reference validator `skills-ref validate` does check name==dir and rejects unknown keys [verified, source]. Codex's and Anthropic's `quick_validate.py` reject anything outside the spec's key set, which would fail `disable-model-invocation` [verified, source]. So segov-stack needs its own small linter, plus `claude plugin validate --strict` for the manifests.
- **Claude Code now ships a plugin eval runner: `claude plugin eval`.** It runs `evals/<case>/prompt.md` + `graders/*.md` in isolated `claude -p` children, runs each case 3 times with the plugin and 3 times without it (the baseline arm), scores with free graders (`regex`, `tool_used`, `tool_order`, `file_exists`) and judge graders (`llm`, `baseline`), and exits non-zero below `--threshold`. It is built for CI (`--trust-plugin`, `--json`, `--max-cost-usd`) [verified, [docs](https://code.claude.com/docs/en/plugin-evals)]. It is Claude-only.
- **skill-creator is the other Anthropic harness, and its format is the de facto portable one.** `evals/evals.json` (prompt, expected_output, files, assertions) and a trigger set (`[{query, should_trigger}]`) are documented on agentskills.io as client-neutral [verified]. elevenlabs/skills reuses both formats against `cursor-agent` instead of Claude [verified]. The two Anthropic formats are not interchangeable [verified, [skills docs](https://code.claude.com/docs/en/skills#evaluate-and-iterate-on-a-skill)].
- **How to tell that a skill fired differs per harness:**
  - **Claude Code:** a `tool_use` block with `name: "Skill"` and `input.skill` equal to `<name>` or `segov-stack:<name>`, in `--output-format stream-json --verbose` [verified].
  - **Codex:** no skill event exists in `codex exec --json`. Detect a `command_execution` item whose `command` reads `.../<name>/SKILL.md`, or force the skill with a `$name` mention and assert on behavior [verified, source].
  - **opencode:** a `tool_use` event in `opencode run --format json` with `part.tool == "skill"`, `part.state.status == "completed"`, and `part.state.input.id == "<name>"`. v1 used `input.name` [verified, source]. A headless run without `--auto` auto-rejects every permission ask [verified, source], and an unconfigured skill load is an ask [inference], so allow `skill` in test config.
- **Discovery is checkable without the model in two of three harnesses.** Claude: the `system/init` event lists `skills` and `plugins` / `plugin_errors` (the run still makes one model call unless you stop it after init) [verified]. Codex: `codex debug prompt-input` renders the model-visible input with no model call [verified that it exists; [inference] that it includes the skills catalog]. opencode v2: `GET /api/skill` on `opencode serve` lists `{id, name, description, path, content}` with no model call. Poll it, because the first response after boot came back empty [verified, ran locally].
- **Real repos run only static checks in CI.** cursor/plugins, claude-plugins-official, claude-plugins-community, and vercel-labs/skills validate manifests, frontmatter, and installers, with no model calls. mattpocock/skills runs no validation in CI. The only behavior-eval suites I found (elevenlabs/skills, math-olympiad's `trigger_eval.json` in claude-plugins-official) are run by hand, with no workflow [verified].
- **Out of scope here:** composing harness-specific text at load time and harness-identifying env vars are covered in [harness-specific-skill-content.md](harness-specific-skill-content.md).

---

## 1. Static validation

### What each validator checks

| Check | `skills-ref validate` (spec reference) | `quick_validate.py` (Anthropic skill-creator) | `quick_validate.py` (Codex skill-creator) | `claude plugin validate --strict` |
|---|---|---|---|---|
| SKILL.md exists, has frontmatter | yes | yes | yes | yes (skills dir or plugin) |
| `name` regex, ≤64 chars, no edge or double hyphen | yes (Unicode letters allowed, lowercase) | yes (`^[a-z0-9-]+$`) | yes | no (did not flag `Bad_Name` dir) |
| `name` == directory name | **yes** | no | no | **no** (ran locally) |
| `description` required, ≤1024 chars | yes | yes, plus no `<` or `>` | yes, plus no `<` or `>` | missing description is a warning, so `--strict` fails it (ran locally) |
| Unknown frontmatter keys | **error** (allowed: name, description, license, allowed-tools, metadata, compatibility) | **error**, same six | **error**, five (no `compatibility`) | **not flagged** (`mode: true` passed, ran locally) |
| `compatibility` ≤500 chars | yes | yes | — | — |
| Exactly one SKILL.md per skill | — | yes | — | — |
| Manifest schema, paths exist, no `..` | — | — | — | yes |

Sources:

- skills-ref: [validator.py](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py), [README](https://github.com/agentskills/agentskills/blob/main/skills-ref/README.md). The README says "This library is intended for demonstration purposes only. It is not meant to be used in production." [verified]
- Anthropic: [skill-creator/scripts/quick_validate.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/quick_validate.py) [verified]. The local synced copy differs slightly from GitHub `main` but has the same key set.
- Codex: `skills/.system/skill-creator/scripts/quick_validate.py` in [openai/skills](https://github.com/openai/skills) and the bundled sample at `S:skills/src/assets/samples/skill-creator/scripts/` [verified by subagent read of source].
- Claude: [plugin validate reference](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate) [verified]. Fixture results [verified, ran locally on 2.1.294]:
  - `skills/Bad_Name/SKILL.md` with `name: other-name` and `mode: true`: no finding.
  - `skills/broken/SKILL.md` with `description: [unclosed`: no finding.
  - `skills/nodesc/SKILL.md` with no description: warning `No description in frontmatter`, so `success: false` under `--strict`.

What the runtimes do with the same input:

- **Claude Code:** with malformed YAML, it "loads the skill body with empty metadata, so `/skill-name` still works but Claude can't match against your `description`. Run with `--debug` to see the parse error" ([skills troubleshooting](https://code.claude.com/docs/en/skills#skill-not-triggering)) [verified]. It accepts every Claude-only field. The upload paths (claude.ai, Skills API, `package_skill.py`) hard-fail on any key outside the six spec fields ([skills docs](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code)) [verified].
- **Codex:** the Rust loader requires `description`, defaults `name`, tolerates unknown keys, and auto-quotes unquoted values containing `: ` ([S:skills/src/parser.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/parser.rs)) [verified]. So Codex is lenient at load time while its own `quick_validate.py` is strict.
- **opencode (v2.0.22):** the frontmatter schema is `{name?, description?, metadata?}`. The skill `id` is the directory name, and `name` defaults to the id ([skill-file.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/skill-file.ts)) [verified]. In a local run [verified, ran locally]:
  - `name: other-name` in dir `mismatch/` loaded as `id: mismatch`, `name: other-name`.
  - `name: Upper_Case` loaded.
  - Unknown keys (`allowed-tools`, `foo`) were dropped silently.
  - A skill with no `description` loaded but was left out of the model's `<available_skills>` list, so it can never trigger.
  - Invalid YAML was **skipped silently**, with only a debug log line.
  - The docs ([skills](https://opencode.ai/docs/skills/)) say `name` must match the regex and the directory, but v2 doesn't enforce either [verified, docs source vs code]. Don't rely on opencode to reject a bad skill.

[inference] The consequence for segov-stack: a skill with `disable-model-invocation: true` is valid for Claude Code and Codex at runtime, but fails both `skills-ref validate` and both `quick_validate.py` scripts. Your linter should allow an explicit extension list (`disable-model-invocation`, maybe `argument-hint`) rather than run skills-ref unmodified.

### Validation that real repos run in CI

| Repo | Workflow | What it runs | Model calls |
|---|---|---|---|
| cursor/plugins | [validate-plugins.yml](https://github.com/cursor/plugins/blob/main/.github/workflows/validate-plugins.yml) | ajv against `schemas/*.json`, source dir exists, name match (see earlier doc) | none |
| claude-plugins-official | [validate-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-plugins.yml) | the community composite action (below) with `claude-cli-version: latest` | none |
| claude-plugins-official | [validate-frontmatter.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-frontmatter.yml) | `bun .github/scripts/validate-frontmatter.ts` on changed `agents/*.md`, `skills/*/SKILL.md`, `commands/*.md`. It YAML-parses frontmatter (pre-quoting values with YAML special chars) and requires `name` and `description` ([script](https://github.com/anthropics/claude-plugins-official/blob/main/.github/scripts/validate-frontmatter.ts)) | none |
| claude-plugins-official | [scan-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/scan-plugins.yml) | a Claude policy scan of changed external entries, authenticated with Workload Identity Federation, with a verdict cache keyed on `<plugin>@<sha>` and the policy hash "so the scan would [not] re-burn ~90s of Claude time per entry per night" | yes, cached |
| claude-plugins-community | [validate-plugins action](https://github.com/anthropics/claude-plugins-community/blob/main/.github/actions/validate-plugins/README.md) | installs `@anthropic-ai/claude-code` fresh each run, runs `claude plugin validate` on the marketplace and each changed plugin, plus invariants I1–I11 (alpha sort, no dup names, description 10–2000 chars, https sources, SHA pins, name regex `^[a-z0-9][a-z0-9-]{1,63}$`, no hidden Unicode). "The source of truth for the marketplace/plugin schema is the Zod definition inside `@anthropic-ai/claude-code`… There is no vendored or fetched JSON Schema" | none; the action takes no API key |
| vercel-labs/skills | [ci.yml](https://github.com/vercel-labs/skills/blob/main/.github/workflows/ci.yml), [agents.yml](https://github.com/vercel-labs/skills/blob/main/.github/workflows/agents.yml) | vitest on the installer across ubuntu and windows and 3 Node versions. Tests build a temp `SKILL.md`, install it for an agent, and assert the files land in that agent's dir (for example [installer-symlink.test.ts](https://github.com/vercel-labs/skills/blob/main/tests/installer-symlink.test.ts) checks `.agents/skills/<name>/SKILL.md` exists and is not a self-loop symlink) | none |
| mattpocock/skills | release, triage only | no validation in CI. `AGENTS.md`: "Run `claude plugin validate . --strict` after touching either manifest" ([CLAUDE.md](https://github.com/mattpocock/skills/blob/main/CLAUDE.md)) | none |
| anthropics/skills, openai/skills | none | no `.github/workflows` at all | — |

All [verified] from the cloned workflow files.

[verified] `claude plugin validate` needs no credentials: the community action passes none, and it ran locally in under a second. The community action's install step retries `npm i -g @anthropic-ai/claude-code` because "on hosted runners that fetch intermittently stalls or is skipped… leaving 'added 1 package' but no usable `claude` binary" ([action.yml](https://github.com/anthropics/claude-plugins-community/blob/main/.github/actions/validate-plugins/action.yml)). Pin the version and verify `claude --version` in CI.

### Cross-harness token lint

No repo I read lints skill bodies for harness-specific tokens in CI. mattpocock enforces neutral wording through `AGENTS.md` and review only ([native-question-tool.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md)) [verified]. A grep lint is therefore [inference]. Tokens worth flagging, each with a source showing it only works in one harness:

- `` !` `` at line start or after whitespace, and ` ```! ` fences: Claude-only dynamic context injection ([skills](https://code.claude.com/docs/en/skills#inject-dynamic-context)). Codex and opencode pass them to the model verbatim (section 6).
- `$ARGUMENTS`, `$0`…`$N`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`: Claude substitutions ([skills](https://code.claude.com/docs/en/skills#available-string-substitutions)).
- Tool names `AskUserQuestion`, `Task tool`, `subagent_type`, `TodoWrite`; paths `.claude/`, `.cursor/`, `.codex/`.

### Link checks

[inference] No source repo checks relative links inside skills. A simple check: every relative Markdown link or backticked `references/…`, `scripts/…` path in a SKILL.md resolves inside the skill dir. This matters across harnesses because the spec says file references are relative to the skill root ([spec](https://agentskills.io/specification)), and Codex drops symlinks at install (earlier doc).

## 2. Discovery and load tests

The question here is "does each harness see the skill, under the expected name, from the expected install route". It needs no grading.

### Claude Code

**Local dev loop** [verified, [create a plugin](https://code.claude.com/docs/en/plugins/create)]:

- `claude --plugin-dir .` loads the repo as a plugin for one session. Repeat the flag for more. Edit files, then `/reload-plugins`.
- `CLAUDE_CODE_PLUGIN_DIRS=/abs/path` does the same where you can't pass a flag (v2.1.280+).
- `claude plugin marketplace add ./` then `claude plugin install segov-stack@segov` tests the real install route from a local directory marketplace (earlier doc).
- `claude plugin details <name>` shows "a plugin's component inventory and projected token cost" [verified, `--help`, ran locally].

**Headless discovery check.** The first `stream-json` event is `system/init` ([headless](https://code.claude.com/docs/en/headless#read-session-metadata)). Its type ([SDKSystemMessage](https://code.claude.com/docs/en/agent-sdk/typescript)) includes `skills: string[]`, `slash_commands: string[]`, `plugins: {name, path}[]`, `plugin_errors?: {plugin, type, message, path?}[]`, and `claude_code_version` [verified]. The docs section "Fail CI when a plugin or MCP server doesn't load" recommends gating on `plugin_errors` [verified].

```bash
claude -p "reply with OK" --plugin-dir . --output-format stream-json --verbose --max-turns 1 \
  | jq -c 'select(.type=="system" and .subtype=="init") | {skills, plugins, plugin_errors}'
```

- [inference] Expect plugin skills as `segov-stack:<name>` in `skills`. I did not run a model call to confirm the exact string.
- [inference] The prompt still costs one small model turn. Killing the process after the init line should avoid most of it, but I did not test whether the request is already sent by then.
- **Don't use `--bare` for trigger or discovery tests.** Bare mode skips installed plugins and auto-discovered skills, and "it doesn't get the list of available skills, including skills from an `--add-dir` folder" ([headless](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)) [verified]. `--plugin-dir` still loads in bare mode [verified, same table], but [inference] without the skill listing the model can't trigger on descriptions.
- **Isolation.** A normal `-p` run loads `~/.claude` (your personal skills, plugins, hooks, CLAUDE.md). That pollutes discovery and trigger results [verified, headless docs]. Options: `--setting-sources project` limits settings sources [verified, [CLI reference](https://code.claude.com/docs/en/cli-reference)]; `claude plugin eval` already gives each run a temporary home and loads only the plugin under test [verified, [plugin-evals](https://code.claude.com/docs/en/plugin-evals#how-runs-are-isolated)]. [inference] For a hand-rolled harness, point `HOME` at a temp dir and authenticate with `ANTHROPIC_API_KEY`.
- **Manual check:** ask "What skills are available?" ([skills troubleshooting](https://code.claude.com/docs/en/skills#skill-not-triggering)) [verified]. `/context` shows the Skills listing size after its budget; descriptions get dropped when the listing exceeds ~1% of the context window [verified, same page]. With a large plugin, test with your real skill count, since a dropped description cannot trigger.

### Codex

**Local dev loop** [verified, earlier doc and [Codex skills docs](https://learn.chatgpt.com/docs/build-skills)]: symlink or copy `skills/<name>` into `~/.agents/skills/` or `<repo>/.agents/skills/`. Codex walks `.agents/skills` from the cwd up to the repo root ([S:ext/skills/src/host_roots.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs)). Or install the plugin: `codex plugin marketplace add ./` and `codex plugin add segov-stack@segov` ([S:cli/src/plugin_cmd.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/plugin_cmd.rs)). Codex drops symlinks at plugin install (earlier doc), so test the plugin route with real files.

**What the model receives.** A developer-role `<skills_instructions>` block lists each skill's name, description, and path, and tells the model: "If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn", and to "read its `SKILL.md` completely before taking task actions" ([S:ext/skills/src/catalog_prompt.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/catalog_prompt.rs)) [verified]. The catalog budget is 2% of the context window capped at 10,000 tokens, with descriptions capped at 1,024 chars ([S:config/src/skills_config.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/skills_config.rs)) [verified, subagent].

**Headless discovery check.** There is no `codex skills` subcommand ([S:cli/src/main.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs)) [verified]. Two options:

- `codex debug prompt-input "hi"` prints "the model-visible prompt input list as JSON". It builds a thread and the session context without running a turn ([S:core/src/prompt_debug.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/prompt_debug.rs)) [verified]. [inference] The output includes the `<skills_instructions>` developer message, so `grep -c '<name>'` style checks work with no model call. [unverified] by running.
- The app-server protocol has a `skills/list` request ([S:app-server-protocol/src/protocol/common.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs)) [verified exists].

**Config for tests** [verified, `skills_config.rs`]:

```toml
[skills]
include_instructions = true      # false drops the catalog block (a "no skills" baseline)
[[skills.config]]
name = "my-skill"                # or path = "/abs/.../SKILL.md"
enabled = false                  # per-skill off switch, e.g. for a baseline arm
```

`[features] skills` is a legacy no-op ([S:config/src/config_toml.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs)) [verified, subagent]. `codex exec --ignore-user-config` skips `$CODEX_HOME/config.toml` while auth still uses `CODEX_HOME` ([S:exec/src/cli.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs)) [verified]. [inference] Setting `CODEX_HOME` to a temp dir plus `--ignore-user-config` isolates a test from your personal `~/.codex`, but `~/.agents/skills` is a separate user root, so also set `HOME` to a temp dir.

### opencode

**Local dev loop.** opencode reads `.opencode/skills/`, `.claude/skills/`, and `.agents/skills/` in the project (walking up), plus the `~/` equivalents (earlier doc). So the same `~/.agents/skills` symlinks you use for Codex also reach opencode. v2 also accepts a loose `skills/<name>.md` file, because the scan glob is `{*.md,**/SKILL.md}` ([skill-file.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/skill-file.ts)) [verified]. On a duplicate id, the last source wins, in the order `.opencode`, then `.claude`, then `.agents` [verified, source].

**What the model receives (v2).** A system instruction lists `<available_skills>` with `<id>`, `<name>`, and `<description>`, and says "Use the skill tool to load a skill when a task matches its description" ([skill/instructions.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill/instructions.ts)) [verified]. Skills are left out of the list when they:

- have no `description`,
- set `metadata["opencode/autoinvoke"]` to false, or
- are denied by the agent's permissions.

v1 put the list in the skill tool's description instead [verified, subagent].

**Headless discovery check, no model call** [verified, ran locally on 2.0.22]:

```bash
cd "$PROJECT" && OPENCODE_SERVER_PASSWORD=pw opencode serve --port 47124 --hostname 127.0.0.1 &
# poll: the first response after boot can be empty while skills load
curl -s -u opencode:pw "http://127.0.0.1:47124/api/skill?directory=$PWD" | jq '.data[].id'
```

- Output shape: `{"location":{"directory":…},"data":[{"id","name","description"?,"autoinvoke"?,"path","content"}]}` ([openapi.json](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/protocol/openapi.json), [handlers/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/server/src/handlers/skill.ts)).
- `opencode api --standalone GET /api/skill` exists but returned `data: []` in the same race. Use a long-lived `serve` and retry.
- The built-in skills `opencode` and `report` always appear in v2.
- v1 had `opencode debug skill` (a JSON array of `{name, description, location, content}`). v2.0.22's `opencode debug` has only `agents`, `config`, and `paths` [verified, ran locally].

**Isolation.**

- v2 has no `OPENCODE_DISABLE_CLAUDE_CODE*` flag. It always reads `~/.claude/skills` and `~/.agents/skills` [verified, grep of v2 source]. The v2 CLI docs still list those flags, but they work only on v1 [verified, subagent].
- So isolate with a fake home. Use `HOME` and/or `OPENCODE_TEST_HOME`, which overrides `os.homedir()` in source and is a test-support variable. Use `OPENCODE_CONFIG_DIR` or `OPENCODE_CONFIG_CONTENT` for config [verified, `packages/cli/src/server-process.ts`, `core/src/config.ts`].
- Whether `HOME` alone suffices is [unverified]. Check the `GET /api/skill` listing to confirm that only the expected skills are present.
- `opencode run` uses a background service by default, and that service reads server-side env at its own start. Pass `--standalone` so the test's env applies [inference from `packages/cli/src/services/server-connection.ts`].

## 3. Triggering tests

### The method (shared by every source)

[verified, [agentskills.io: Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions), which mirrors skill-creator]:

- **Eval set:** about 20 queries, 8–10 `should_trigger: true` and 8–10 `false`. The negatives should be **near-misses** that share keywords with the skill, not unrelated prompts. Use realistic detail: file paths, personal context, typos.
- **Format:** `[{ "query": "...", "should_trigger": true }]`.
- **Runs:** each query 3 times; trigger rate = triggers / runs; a positive passes if rate ≥ 0.5, a negative if rate < 0.5.
- **Overfitting:** split 60% train / 40% validation, stratified by label, fixed across iterations. Pick the best description by validation score.
- **Caveat on what can trigger:** "agents typically only consult skills for tasks that require knowledge or capabilities beyond what they can handle alone. A simple, one-step request like 'read this PDF' may not trigger a PDF skill even if the description matches perfectly." So trivial queries are bad positives.
- **Detection:** "The skill triggered if the agent loaded your skill's `SKILL.md`." That client-neutral definition is what makes the method portable.

### skill-creator's implementation (Claude only)

[verified, [run_eval.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_eval.py), [run_loop.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_loop.py)]:

- For each query it writes a temporary `.claude/commands/<name>-skill-<uuid>.md` holding only the description, then runs `claude -p "<query>" --output-format stream-json --verbose --include-partial-messages` with `CLAUDECODE` removed from the env "to allow nesting claude -p inside a Claude Code session".
- It decides early from stream events: at the first `content_block_start` of a `tool_use`, if the tool is not `Skill` or `Read` it returns false; otherwise it accumulates `input_json_delta` and returns true once the unique name appears. It kills the process as soon as the outcome is known, which saves cost.
- Defaults: `--runs-per-query 3`, `--trigger-threshold 0.5`, `--num-workers 10`, `--timeout 30`, `--holdout 0.4`, up to 5 improvement iterations, and `improve_description.py` calls `claude -p` to propose a new description.
- [inference] Two limits matter for you. It tests a synthetic command file, not your installed plugin skill, so it measures description wording, not discovery. And it competes against whatever else is in your `~/.claude`.

Real trigger sets exist in [claude-plugins-official math-olympiad `evals/trigger_eval.json`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/math-olympiad/skills/math-olympiad/evals) and per skill in [elevenlabs/skills `evals/<skill>/trigger_eval.json`](https://github.com/elevenlabs/skills/tree/main/evals) [verified].

### `claude plugin eval` for triggering

[verified, [plugin-evals](https://code.claude.com/docs/en/plugin-evals)]: put one case per query and add a `tool_used` grader:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?my-skill"'
---
```

- It "passes when Claude invoked that skill at least once during the run, including by its namespaced `plugin-name:skill-name` form".
- For a should-not-trigger case use `min: 0`, `max: 0`, and `arm: both`.
- In two-arm runs, `tool_used: Skill` graders are excluded from the score and shown as a "plugin-fired indicator", because they can never pass without the plugin. Use `--ablation none` for a pure trigger suite so they count.
- The docs name the most common first finding: "a `Δ` near zero with the case's `tool_used: Skill` grader failing, which means Claude isn't choosing your skill on natural phrasing."

### Detecting a trigger per harness (for a portable runner)

| Harness | Command | Trigger signal in the output |
|---|---|---|
| Claude Code | `claude -p "$Q" --plugin-dir . --output-format stream-json --verbose [--include-partial-messages] --max-turns N` | an `assistant` message with a `tool_use` content block, `name == "Skill"`, `input.skill` matching `^(segov-stack:)?<name>$`. Fallback: a `Read` `tool_use` whose `input.file_path` ends `/<name>/SKILL.md` [verified, run_eval.py + plugin-evals] |
| Codex | `codex exec --json --ephemeral --skip-git-repo-check -s read-only -C "$WS" "$Q"` | an `item.started` / `item.completed` with `item.type == "command_execution"` whose `command` contains `/<name>/SKILL.md` [inference from source: there is no skill event in `--json` ([S:exec/src/event_processor_with_jsonl_output.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/event_processor_with_jsonl_output.rs)), and Codex itself detects implicit skill use by parsing shell reads of SKILL.md in `detect_skill_doc_read` ([S:skills/src/invocation.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/invocation.rs))] |
| opencode | `OPENCODE_CONFIG_CONTENT='{"permission":{"skill":"allow"}}' opencode run --standalone --format json -m provider/model "$Q"` | a `tool_use` line with `part.tool == "skill"`, `part.state.status == "completed"`, and `part.state.input.id == "<name>"` (v1: `.name`). The output also contains `<skill_content name="<name>">` [verified, source: [skill tool](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts), [noninteractive.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/run/noninteractive.ts)] |

Codex caveats:

- The `command` string is the shell wrapper, such as `/bin/zsh -lc "cat .../SKILL.md"`, so match a substring [verified, subagent read of exec events]. [unverified] whether models read it with `cat`, `sed -n`, or another tool in practice.
- The catalog may list a short path with a root alias that the model must expand ([catalog_prompt.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/catalog_prompt.rs)), so match `<name>/SKILL.md`, not the absolute path.
- The elevenlabs runner uses the same "read of SKILL.md" rule for `cursor-agent`: it stages a uniquely renamed copy under the temp workspace's `.cursor/skills/` and sets `triggered` when a read tool call's path contains `SKILL.md` and the install name ([run_all.py](https://github.com/elevenlabs/skills/blob/main/evals/run_all.py)) [verified]. That is the closest real precedent for a multi-harness trigger runner.

## 4. Behavior / outcome evals

### Case format

Two formats exist and neither tool reads the other's [verified, [skills docs](https://code.claude.com/docs/en/skills#evaluate-and-iterate-on-a-skill)]:

**A. skill-creator / agentskills.io `evals/evals.json`** (inside the skill dir) [verified, [evaluating skills](https://agentskills.io/skill-creation/evaluating-skills), [schemas.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/references/schemas.md)]:

```json
{
  "skill_name": "csv-analyzer",
  "evals": [{
    "id": 1,
    "prompt": "I have a CSV of monthly sales data in data/sales_2025.csv. ...",
    "expected_output": "A bar chart image showing the top 3 months ...",
    "files": ["evals/files/sales_2025.csv"],
    "assertions": ["The output includes a bar chart image file", "Both axes are labeled"]
  }]
}
```

- skill-creator's schema calls the list `expectations`; agentskills.io calls it `assertions`. elevenlabs uses `expectations` [verified]. Accept both.
- Outputs per run: `grading.json` (`{text, passed, evidence}` per assertion, plus `summary.pass_rate`), `timing.json` (`total_tokens`, `duration_ms`), and an iteration-level `benchmark.json` with mean ± stddev per configuration and the with-minus-without `delta`.
- Workspace layout: `<skill>-workspace/iteration-N/eval-<name>/{with_skill,without_skill}/outputs/`.
- Runs execute as Claude Code subagents spawned by the skill-creator session, not as `claude -p` processes. The trigger-eval scripts are the only part that shells out [verified, SKILL.md]. [inference] So this format is portable but skill-creator's runner is not CI-ready.

**B. `claude plugin eval` cases** (under the plugin's `evals/`) [verified, [plugin-evals](https://code.claude.com/docs/en/plugin-evals#eval-suite-reference)]:

```
evals/<case>/prompt.md        # frontmatter: max_turns, timeout_seconds, allowed_tools, model, tags, runs, env (EVAL_* only)
evals/<case>/graders/*.md     # type: regex | tool_used | tool_order | file_exists | llm | baseline
evals/<case>/case.yaml        # optional: context.scaffold_script, context.add_dirs, context.history_file
evals/mocks/<server>/<tool>.md
```

- **Scaffolding.** Each run starts in an empty workspace. A `scaffold_script` seeds files or git state, runs only with `--scaffold`, and has a 120-second limit.
- **Graders.** `regex` targets `last_message` (default), `trace`, `files`, `mock_calls`, or `{source: file, path}`. `llm` passes on 2 of 3 judge votes. There are no custom-code graders.
- **Tools.** Runs never prompt for permission. Only read-only tools from `allowed_tools` are granted. `Bash`, `Write`, and `Edit` need `--allow-tools`, and granted Bash runs under the OS sandbox (Linux needs `bubblewrap` and `socat`).
- **Isolation.** Each run gets a temp home, cwd, and config. "Nothing personal or project-level loads." The agent can't read the eval directory.
- **Grader advice from the docs.** Grade long outputs with `regex` over the file, keep `llm` graders for short outputs, and give each case one result grader plus one process grader (`tool_used` or `tool_order`).

[inference] Format B puts `evals/` at the plugin root, beside `skills/`. That is the same path skill-creator would use only if a skill dir were the plugin root, so the two don't collide in a flat `skills/<name>/` repo. If you need another path, set `experimental.evals` in `plugin.json` or pass `--eval-dir` [verified].

### Headless commands and output per harness

**Claude Code** [verified, [headless](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference)]:

```bash
claude -p "$PROMPT" --plugin-dir "$REPO" \
  --output-format stream-json --verbose \
  --max-turns 20 --max-budget-usd 1.00 \
  --permission-mode acceptEdits --allowedTools "Bash(npm test *)" \
  --no-session-persistence --model claude-sonnet-5 > run.jsonl
```

- `--output-format json` returns one result object: `result`, `session_id`, `num_turns`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials`, `is_error`, and `structured_output` with `--json-schema` ([SDKResultMessage](https://code.claude.com/docs/en/agent-sdk/typescript)). It has **no** messages array.
  - [inference] The agentskills.io sample script's `jq '.messages[].content[]'` on `--output-format json` therefore won't match anything. Use `stream-json` and select `type=="assistant"` lines.
- `stream-json` lines: `system/init` first, then `assistant` and `user` messages (tool_use and tool_result blocks), and a final `result`. Subagent and forked-skill messages carry `parent_tool_use_id`. Denials appear as `permission_denied` system messages.
- Exit 0 on success, non-zero on failure; SIGTERM gives 143.
- Pass `--permission-mode dontAsk` for locked-down CI, or `--permission-prompts none` (v2.1.259+) so nothing waits on a prompt.

**Codex** [verified, [non-interactive docs](https://learn.chatgpt.com/docs/non-interactive-mode), [S:exec/src/cli.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs), [S:exec/src/exec_events.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs)]:

```bash
codex exec --json --ephemeral --skip-git-repo-check \
  -C "$WS" -s workspace-write -m "$MODEL" \
  -o last-message.txt --output-schema verdict.schema.json \
  '$my-skill do X' > run.jsonl
```

- JSONL events: `thread.started {thread_id}`, `turn.started`, `turn.completed {usage: input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, …}`, `turn.failed {error}`, `item.started|updated|completed {item}`, `error`.
- Item types: `agent_message {text}`, `reasoning`, `command_execution {command, aggregated_output, exit_code, status}`, `file_change {changes:[{path, kind}]}`, `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`.
- The default sandbox is read-only. Codex requires a git repo unless you pass `--skip-git-repo-check`. Progress goes to stderr and the final message to stdout.
- `--full-auto` no longer exists in source (subagent grep found no match) [verified absence]. Use `-s workspace-write`, or `--dangerously-bypass-approvals-and-sandbox` only inside an external sandbox.
- **Forcing a skill:** `$name` in the prompt injects the full SKILL.md as a user-role `<skill><name>…</name><path>…</path>…</skill>` fragment, truncated to 8,000 bytes ([S:ext/skills/src/fragments.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/fragments.rs), [S:skills/src/mentions.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/mentions.rs), test assertions in [S:core/tests/suite/skills.rs](https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/skills.rs)) [verified]. Use single quotes in bash so the shell doesn't expand `$my`.
  - [inference] Because injection is up front, an explicit-mention run shows no SKILL.md read in `--json`. Grade behavior, not the read.
  - A skill whose body is over 8 KB is cut for Codex. Add that limit to the linter.
- `--output-schema` + `-o` gives a machine-checkable final answer, useful as a cheap self-report grader [verified docs pairing; use as grader is inference].
- Rollout files under `~/.codex/sessions/` hold `response_item` lines. [inference] They contain the `<skills_instructions>` and `<skill>` items, which would make them the better transcript for proving injection. `--ephemeral` disables them.

**opencode**

[verified, local `opencode run --help` on 2.0.22, [packages/cli/src/run/noninteractive.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/run/noninteractive.ts), [packages/core/src/tool/plugin/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts)]:

```bash
OPENCODE_CONFIG_CONTENT='{"permission":{"skill":"allow"}}' \
  opencode run --standalone --format json -m anthropic/<model> [--auto] "$PROMPT" > run.jsonl
```

- **Flags (v2):** `--standalone`, `--server <url>`, `-c/--continue`, `-s/--session`, `--fork`, `-m provider/model#variant`, `--agent`, `--format default|json`, `-f/--file` (repeatable), `--title`, `--thinking`, `--auto` (hidden aliases `--yolo`, `--dangerously-skip-permissions`). v1's `--attach`, `--share`, `--port`, and `--command` are gone; `--server` replaces `--attach`.
- **Permissions:** without `--auto`, each permission request is answered `reject`, and the model is told "This non-interactive run cannot ask the user for permission, so the request was rejected. Continue without this action." The run continues. With `--auto`, it answers `once`, and explicit `deny` rules still hold.
  - [inference] The default for an unmatched action is `ask` (`core/src/permission.ts`), so set `permission.skill: "allow"` or a test silently measures "skill rejected" instead of "skill not chosen".
- **`--format json`** prints one object per line, `{"type", "timestamp", "sessionID", …}`, with these types:
  - `step_start`.
  - `text`: emitted when a text block ends.
  - `reasoning`: only with `--thinking`.
  - `tool_use`: emitted only on completion or failure. `part = {type:"tool", tool, id, state:{status, input, output, metadata, time}}`; a failure has `status:"error"` and `error`.
  - `step_finish`: has `cost` and `tokens`.
  - `error`: errors set exit code 1.
- **The skill tool (v2)** is `skill` with input `{id}`, the directory name. v1 took `{name}`, and the v2 migration notes the change. Its result is a `<skill_content name="…">` block with the body, the base directory, and up to 10 bundled file paths ([core/src/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill.ts)).
- **Programmatic route:** the v2 HTTP API (`POST /api/session`, `POST /api/session/{id}/prompt`, `GET /api/session/{id}/message`, SSE `GET /api/event`, basic auth `opencode:$OPENCODE_SERVER_PASSWORD`) ([openapi.json](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/protocol/openapi.json)) [verified]. The documented `@opencode-ai/sdk` targets the v1 REST paths ([SDK docs](https://opencode.ai/docs/sdk/)). Whether v2 still serves those paths is [unverified].
- **The docs lag v2 in places.** For example, the skills doc still shows `skill({name})` [verified, subagent]. Pin the opencode version in tests.

### Grading options

All three graders below work on any harness's output, so the grading layer is where a shared test suite lives [inference]:

1. **Assertions on files** in the workspace: exists, parses, matches a regex, a test command passes. "For assertions that can be checked by code… use a verification script — scripts are more reliable than LLM judgment for mechanical checks" ([agentskills.io](https://agentskills.io/skill-creation/evaluating-skills)) [verified].
2. **Transcript assertions** on normalized events: the skill fired, tool X was called, tool X ran before tool Y. Map each harness's stream to one shape such as `{kind: "tool", name, input}` and `{kind: "text", text}` [inference]. `claude plugin eval`'s `tool_used` and `tool_order` are the model to copy [verified].
3. **LLM-as-judge** on the final message or a file, with concrete PASS/FAIL rubrics and multiple votes. `claude plugin eval` takes 2 of 3 votes, judges with Haiku by default, and the docs warn that "a small judge model can mark a correct answer wrong because it's formatted differently" ([plugin-evals](https://code.claude.com/docs/en/plugin-evals#choose-graders-that-give-a-stable-signal)) [verified]. skill-creator's [grader.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md) also asks the judge to flag weak assertions ("A passing grade on a weak assertion is worse than useless") [verified].

Always run a baseline: without the skill, or with the previous version. A score that is equally high without the skill means the skill isn't what produced it ([plugin-evals](https://code.claude.com/docs/en/plugin-evals#the-no-plugin-baseline), [agentskills.io](https://agentskills.io/skill-creation/evaluating-skills)) [verified]. Per-harness ways to turn the skill off: Claude `skillOverrides: "off"` for non-plugin skills, or `claude plugin eval`'s no-plugin arm for plugin skills ([skills](https://code.claude.com/docs/en/skills#evaluate-and-iterate-on-a-skill)) [verified]; Codex `[[skills.config]] enabled = false` [verified]; opencode `permission.skill: {"<name>": "deny"}` through `OPENCODE_CONFIG_CONTENT`, which also hides the skill from the listing ([skills docs](https://opencode.ai/docs/skills/), `core/src/skill/instructions.ts`) [verified].

## 5. CI: what runs, auth, cost, nondeterminism

### What real repos run

Covered in section 1. Summary: static validation only, everywhere I looked. No repo I read runs model-calling skill evals on PRs [verified for the repos listed; I did not search exhaustively]. The `gh search code "claude plugin eval" --filename "*.yml"` query returned no hits on 2026-10-08 [verified, ran locally].

### Running each CLI headless in GitHub Actions

| Harness | Install | Auth for headless | Official action |
|---|---|---|---|
| Claude Code | `npm i -g @anthropic-ai/claude-code@<pin>` (the community action shows retries are needed) | `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (subscription; tied to one person, so prefer an API key for shared secrets). `--bare` never reads OAuth or keychain ([headless](https://code.claude.com/docs/en/headless), [github-actions](https://code.claude.com/docs/en/github-actions)) | `anthropics/claude-code-action@v1` with `anthropic_api_key` or `claude_code_oauth_token`, `prompt`, `claude_args` |
| Codex | `npm i -g @openai/codex@<pin>` | `CODEX_API_KEY=<key> codex exec …` (exec enables the env key) or `printenv OPENAI_API_KEY \| codex login --with-api-key` ([docs](https://learn.chatgpt.com/docs/non-interactive-mode), [S:login/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/login/src/lib.rs), [S:cli/src/login.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/login.rs)) | `openai/codex-action@v1`: `openai-api-key` feeds a Responses API proxy so Codex never sees the key; `safety-strategy` defaults to `drop-sudo` ([action.yml](https://github.com/openai/codex-action/blob/main/action.yml)) |
| opencode | `curl -fsSL https://opencode.ai/install \| bash`, as the official action does ([github/action.yml](https://github.com/anomalyco/opencode/blob/v2.0.22/github/action.yml)) | the provider's own env var, such as `ANTHROPIC_API_KEY` ([GitHub docs](https://opencode.ai/docs/github/)); `OPENCODE_API_KEY` for the opencode provider ([core/src/plugin/provider/opencode.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/provider/opencode.ts)); or `opencode auth login` | `anomalyco/opencode/github@latest` (inputs `model` required, `agent`, `prompt`, `use_github_token`, …; needs `id-token: write` unless `use_github_token`). It runs `opencode github run` for comment-driven flows [verified, action.yml + docs] |

All [verified] except where noted. `claude plugin eval` in CI also needs `--trust-plugin`, because "when stdin or stdout isn't a terminal, or under `--json`, the run can't ask and is refused with exit 1" [verified].

For a hand-rolled matrix [inference]: the official actions are built for "respond to @mentions / run a prompt" and return a final message, not a transcript. For trigger and transcript graders, install the CLIs directly in the job and parse their JSON streams.

### Cost

- `claude plugin eval` makes about "cases × runs agent runs with the plugin and the same number again for the no-plugin baseline, plus three short judge calls per `llm` or `baseline` grader per run". The example in the docs reports `$0.41` for one case × 6 runs; that figure is illustrative. Controls: `--max-cost-usd` (exit 2 with `partial: true`), `--ablation none` (halves runs), `--runs`, free graders only for every-change suites ([plugin-evals](https://code.claude.com/docs/en/plugin-evals#run-evals-in-ci)) [verified].
- `claude -p --output-format json` reports `total_cost_usd`, a client-side estimate. `--max-budget-usd` caps one run [verified].
- Codex reports token `usage` in `turn.completed` but no cost; the docs page has no cost guidance [verified absence].
- A trigger suite of 20 queries × 3 runs = 60 invocations per harness [verified arithmetic from agentskills.io]. skill-creator kills each run once the trigger decision is visible, which keeps that cheap [verified].
- Anthropic's own CI caches LLM verdicts by content hash (`<plugin>@<sha>` + policy hash) so unchanged inputs are never re-scanned ([scan-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/scan-plugins.yml)) [verified]. [inference] The same pattern fits skill evals: key results on `hash(SKILL.md tree + case + harness version + model)`.

### Nondeterminism

All sources agree on the approach [verified]:

- **Repeat runs.** skill-creator and agentskills.io use 3 runs per trigger query with a 0.5 threshold. `claude plugin eval` defaults to 3 runs per arm (`runs` 1–50) and scores a case as the mean of runs.
- **Threshold, not perfection.** `claude plugin eval --threshold` defaults to 1.0, and the docs say "Set a threshold that matches the score you require". The CI example uses `0.8`.
- **Pin models.** "Pin it in CI so a model rollout isn't mistaken for a plugin regression" (`--model`, `--judge-model`).
- **Stable graders over judges.** Prefer regex/tool graders, and keep judges on short outputs with concrete rubrics.
- **Read variance as a signal.** High stddev means a flaky eval or an ambiguous skill instruction ([agentskills.io](https://agentskills.io/skill-creation/evaluating-skills#analyzing-patterns)).
- **Exclude partial or limit-hit runs from trends.** Usage-limit errors make later runs score 0 without marking the suite partial; check `cases[].arms.with[].error` ([plugin-evals troubleshooting](https://code.claude.com/docs/en/plugin-evals#runs-fail-with-a-usage-limit-or-rate-limit-error-partway-through)).
- **Replay mocks.** `type: agent` MCP mock answers can be recorded and committed under `mocks/.replay/` "so CI runs are repeatable".

## 6. Side question: harness-specific composition

This question moved to [harness-specific-skill-content.md](harness-specific-skill-content.md). The only facts kept here are the ones the linter in section 7 depends on:

- Claude Code expands `` !`cmd` ``, `$ARGUMENTS`, and `${CLAUDE_*}` in skill bodies ([skills](https://code.claude.com/docs/en/skills#inject-dynamic-context)) [verified].
- Codex reads SKILL.md raw ([S:ext/skills/src/host_outcome.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_outcome.rs)) [verified].
- opencode v2 passes `skill.content.trim()` through unchanged. A body of ``Body $ARGUMENTS !`echo hi` @README.md`` came back verbatim from `GET /api/skill` ([core/src/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill.ts)) [verified, ran locally].

So those tokens reach the Codex and opencode models as literal text.

---

## 7. Recommendation for segov-stack

Tags: **[copied]** = a pattern a source repo or vendor doc uses; **[inference]** = my design.

### Layers and when they run

| Layer | Runs | Cost | Tool |
|---|---|---|---|
| 1. Lint | every commit, pre-commit, PR | free | `scripts/lint-skills.mjs` + `claude plugin validate . --strict` |
| 2. Discovery | PR | free (Codex, opencode) / ~1 tiny call (Claude) | `scripts/discover.sh` |
| 3. Trigger | label-gated PR + nightly | 20 queries × 3 runs × harnesses | `scripts/eval.mjs --mode trigger` |
| 4. Behavior | nightly + before release | cases × 3 runs × 2 arms × harnesses (+ judges) | `claude plugin eval` for Claude; `scripts/eval.mjs --mode behavior` for Codex/opencode |

### 1. `scripts/lint-skills.mjs` [inference, modeled on skills-ref and the claude-plugins-official frontmatter script]

Checks, each copied from a source rule:

- Frontmatter parses as YAML; `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64, equals the directory name [copied skills-ref].
- `description` present, ≤1024 chars [copied spec], and no `<` or `>` [copied both `quick_validate.py`].
- Keys ⊆ the six spec keys + an allowlist (`disable-model-invocation`, `argument-hint`) [inference]. Fail on Cursor `mode`, `icon`, `color`, `reminder` [inference from the earlier doc].
- `disable-model-invocation: true` ⇔ `agents/openai.yaml` `policy.allow_implicit_invocation: false` [copied mattpocock invariant].
- SKILL.md body ≤ 500 lines [copied spec] and ≤ 8,000 bytes, or a warning that Codex truncates it [inference from Codex `MAX_SKILL_PROMPT_BYTES`].
- Relative links and `references/`, `scripts/` paths resolve inside the skill dir; no symlinks [inference].
- Harness-token grep from section 1 [inference]. Allow a `<!-- lint-allow: claude-only -->` marker for deliberate cases.

Then run `claude plugin validate . --strict` [copied mattpocock/claude-plugins-community]. It needs no API key.

### 2. `scripts/discover.sh` [inference]

For each harness, install the repo into a temp `HOME` the way users do, then assert every `skills/*` name is visible:

- Claude: `claude -p ok --plugin-dir . --output-format stream-json --verbose --max-turns 1 | jq` on `system/init` → every `segov-stack:<name>` in `.skills`, and `.plugin_errors` absent [copied the docs' "fail CI when a plugin doesn't load"].
- Codex: `HOME=$T CODEX_HOME=$T/.codex`, link `skills/*` into `$T/.agents/skills/`, then `codex debug prompt-input hi` and grep for each name [inference; verify the output shape once by hand].
- opencode: temp `HOME`/`OPENCODE_TEST_HOME`, skills linked into the temp project's `.agents/skills/`, then `opencode serve` and poll `GET /api/skill?directory=…` until every expected `id` appears and nothing else does [copied endpoint; verified it works locally].

### 3. Case files: one portable format, one Claude-native format

Keep cases harness-neutral in `evals/` per skill, using the agentskills.io shapes so skill-creator can still read them [copied]:

```
skills/<name>/evals/evals.json          # behavior cases (agentskills.io format)
skills/<name>/evals/trigger_eval.json   # [{query, should_trigger}] (agentskills.io / math-olympiad / elevenlabs)
skills/<name>/evals/files/…             # fixtures
```

Extend `evals.json` entries with optional fields your runner understands and skill-creator ignores [inference]:

```json
{
  "id": 1,
  "name": "commit-msg-rename",
  "prompt": "Write me a commit message for this change: I renamed getUser to fetchUser …",
  "files": ["evals/files/repo.tar"],
  "assertions": ["The message's first line is under 72 characters"],
  "checks": [
    { "type": "skill_fired" },
    { "type": "regex", "target": "last_message", "pattern": "^\\w+(\\(.+\\))?: " },
    { "type": "file_exists", "path": "out/*.md" }
  ],
  "harnesses": ["claude", "codex", "opencode"],
  "runs": 3
}
```

- `checks` mirrors `claude plugin eval` grader types so they can be generated from it [inference, names copied from plugin-evals].
- `assertions` stay as free text for an LLM judge [copied skill-creator].

**The evals directory clash:** `claude plugin eval` reads `<plugin>/evals/<case>/…`, which is at the repo root, while the portable files live under `skills/<name>/evals/`. Either generate the plugin-eval cases from `evals.json` into `evals/` (gitignored), or set `"experimental": {"evals": "evals/claude"}` and keep a small hand-written Claude suite there [inference; the `experimental.evals` key is copied from the docs].

### 4. `scripts/eval.mjs` [inference]

One runner, three adapters. Each adapter returns normalized events, and graders run on those:

| Adapter | Spawn | Skill-fired rule |
|---|---|---|
| claude | `claude -p Q --plugin-dir REPO --output-format stream-json --verbose --max-turns N --model M` in a temp `HOME`, `CLAUDECODE` unset when nested [copied run_eval.py] | `tool_use` `Skill` with `input.skill` ~ `^(segov-stack:)?NAME$` [copied] |
| codex | `codex exec --json --ephemeral --skip-git-repo-check -C WS -s workspace-write -m M Q` with `CODEX_API_KEY`, temp `HOME` + `CODEX_HOME`, skills linked into `WS/.agents/skills` [copied flags from docs] | `command_execution` whose `command` contains `NAME/SKILL.md` [inference from source] |
| opencode | `opencode run --standalone --format json -m P/M Q` with `OPENCODE_CONFIG_CONTENT` allowing `skill`, temp `HOME` + `OPENCODE_TEST_HOME`, skills linked into `WS/.agents/skills` | `tool_use` with `part.tool == "skill"`, status `completed`, `input.id` (v2) or `input.name` (v1) == NAME [verified shape] |

Runner behavior:

- 3 runs per (case, harness); a trigger query passes on rate ≥ 0.5, a behavior case passes on mean score ≥ threshold [copied].
- Baseline arm with the skill removed from the temp install [copied concept].
- Kill a trigger run as soon as the first tool call decides it [copied skill-creator].
- Cache results by `sha256(skill dir + case + harness version + model)` [copied pattern from scan-plugins.yml].
- Write one `results/<timestamp>.json` with per-harness pass rates, and fail only on the configured threshold [inference].

### 5. CI workflow outline [inference, steps copied from the workflows cited]

```yaml
# .github/workflows/skills.yml
on:
  pull_request:
  schedule: [{ cron: "0 7 * * *" }]
  workflow_dispatch:
jobs:
  lint:                       # every PR, no secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm i -g @anthropic-ai/claude-code@<pin> && claude --version
      - run: node scripts/lint-skills.mjs
      - run: claude plugin validate . --strict
  discover:                   # every PR
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - run: npm i -g @anthropic-ai/claude-code@<pin> @openai/codex@<pin> && curl -fsSL https://opencode.ai/install | bash
      - run: scripts/discover.sh            # Claude step needs ANTHROPIC_API_KEY for its one call
        env: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" }
  evals:                      # nightly, or PRs labeled run-evals; never on fork PRs
    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'run-evals')
    needs: discover
    strategy: { fail-fast: false, matrix: { harness: [claude, codex, opencode] } }
    runs-on: ubuntu-latest
    steps:
      - uses: actions/cache@v4             # verdict cache keyed on skill hash
      - run: node scripts/eval.mjs --harness ${{ matrix.harness }} --runs 3 --threshold 0.8 --max-cost-usd 5
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          CODEX_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - run: claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model <pin> --judge-model <pin> --no-publish --max-cost-usd 20
        if: matrix.harness == 'claude'
      - uses: actions/upload-artifact@v4
```

Notes:

- Fork PRs don't get secrets; claude-plugins-official also skips validation steps for forks [copied].
- Pin every CLI version and model, since a CLI or model update can move scores [copied plugin-evals advice].
- Start with lint + discover only. Add the eval job once each skill has a trigger set [inference].

### 6. Local loop [copied where noted]

```bash
claude --plugin-dir .                     # [copied docs] edit, then /reload-plugins
scripts/link-skills.sh                    # [copied mattpocock] symlink into ~/.claude/skills and ~/.agents/skills
node scripts/lint-skills.mjs && claude plugin validate . --strict
node scripts/eval.mjs --skill <name> --mode trigger --harness claude --runs 1   # fast check, then 3 runs
claude plugin eval . --case <case> --runs 1 --ablation none                      # [copied docs]
```

Use skill-creator inside Claude Code for description tuning (`run_loop.py`) and blind A/B between versions; it reads the same `evals.json` and `trigger_eval.json` [copied].

## Open / unverified points

- **Claude `system/init.skills` naming.** I didn't confirm whether plugin skills appear as `segov-stack:<name>`, or whether stopping after the init line avoids the model charge.
- **Codex `codex debug prompt-input`.** I didn't confirm that it includes the skills catalog, or what it costs. The local binary is broken.
- **How Codex models read SKILL.md.** The exact `command` strings (`cat`, `sed -n`, a read tool) need one real `--json` run.
- **What Codex rollout files contain.** That they include `<skills_instructions>` and `<skill>` items is inferred, not observed.
- **`claude plugin validate` coverage of skills.** It may check more than my fixture showed, for example on other versions or other fields. I only tested name≠dir, an unknown key, bad YAML, and a missing description.
- **The agentskills.io sample trigger script.** It reads `.messages[]` from `claude -p --output-format json`, which the documented result shape doesn't have. I didn't run it.
- **No public repo found running model-based skill evals in CI.** This is from the repos read plus one GitHub code search, not an exhaustive survey.
- **opencode v2 isolation.** Whether `HOME` alone (without `OPENCODE_TEST_HOME`) keeps `~/.claude/skills` and `~/.agents/skills` out is untested.
- **opencode skills without a permission rule.** That they are auto-rejected in `opencode run` is inferred from the default `ask`. I didn't run a model.
- **The opencode docs vs v2 code.** The docs describe v1 in several places: name validation, `skill({name})`, the `OPENCODE_DISABLE_CLAUDE_CODE*` flags, `--attach`. I read the doc sources in the repo, not the live site.
- **opencode and a fake model.** Whether a fake OpenAI-compatible provider in `OPENCODE_CONFIG_CONTENT` can make opencode skill-loading tests deterministic is untested.

## Sources

**Vendor docs:**

- Claude Code: [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals) · [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) · [Agent SDK TypeScript (SDKSystemMessage, SDKResultMessage)](https://code.claude.com/docs/en/agent-sdk/typescript) · [Skills](https://code.claude.com/docs/en/skills) · [CLI reference](https://code.claude.com/docs/en/cli-reference) · [Plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference) · [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference) · [Create a plugin](https://code.claude.com/docs/en/plugins/create) · [GitHub Actions](https://code.claude.com/docs/en/github-actions)
- Agent Skills: [Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills) ([source](https://github.com/agentskills/agentskills/blob/main/docs/skill-creation/evaluating-skills.mdx)) · [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions) ([source](https://github.com/agentskills/agentskills/blob/main/docs/skill-creation/optimizing-descriptions.mdx)) · [Specification](https://agentskills.io/specification)
- Codex: [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) · [Build skills](https://learn.chatgpt.com/docs/build-skills)
- opencode: [Skills](https://opencode.ai/docs/skills/) · [CLI](https://opencode.ai/docs/cli/) · [Permissions](https://opencode.ai/docs/permissions/) · [GitHub](https://opencode.ai/docs/github/) · [SDK](https://opencode.ai/docs/sdk/) (read as the `packages/web/src/content/docs/*.mdx` sources at `v2.0.22`)

**Source and CI:**

- agentskills/agentskills: [skills-ref/README.md](https://github.com/agentskills/agentskills/blob/main/skills-ref/README.md) · [validator.py](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py)
- anthropics/skills: [skill-creator SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) · [run_eval.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_eval.py) · [run_loop.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_loop.py) · [improve_description.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/improve_description.py) · [quick_validate.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/quick_validate.py) · [references/schemas.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/references/schemas.md) · [agents/grader.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md)
- anthropics/claude-plugins-official: [validate-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-plugins.yml) · [validate-frontmatter.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-frontmatter.yml) · [validate-frontmatter.ts](https://github.com/anthropics/claude-plugins-official/blob/main/.github/scripts/validate-frontmatter.ts) · [scan-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/scan-plugins.yml) · [math-olympiad trigger_eval.json](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/math-olympiad/skills/math-olympiad/evals/trigger_eval.json)
- anthropics/claude-plugins-community: [validate-plugins action.yml](https://github.com/anthropics/claude-plugins-community/blob/main/.github/actions/validate-plugins/action.yml) · [README](https://github.com/anthropics/claude-plugins-community/blob/main/.github/actions/validate-plugins/README.md)
- openai/codex (`S:` = `codex-rs/`): [exec/src/cli.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs) · [exec/src/exec_events.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs) · [exec/src/event_processor_with_jsonl_output.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/event_processor_with_jsonl_output.rs) · [ext/skills/src/catalog_prompt.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/catalog_prompt.rs) · [ext/skills/src/fragments.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/fragments.rs) · [ext/skills/src/host_outcome.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_outcome.rs) · [ext/skills/src/host_roots.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs) · [ext/skills/src/render.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/render.rs) · [skills/src/parser.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/parser.rs) · [skills/src/mentions.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/mentions.rs) · [skills/src/invocation.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/invocation.rs) · [config/src/skills_config.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/skills_config.rs) · [core/src/prompt_debug.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/prompt_debug.rs) · [core/tests/suite/skills.rs](https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/skills.rs) · [cli/src/main.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs) · [login/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/login/src/lib.rs)
- openai/codex-action: [action.yml](https://github.com/openai/codex-action/blob/main/action.yml) · [README](https://github.com/openai/codex-action/blob/main/README.md)
- openai/skills: [README](https://github.com/openai/skills/blob/main/README.md) (deprecated in favor of openai/plugins; no workflows)
- anomalyco/opencode @ v2.0.22: [packages/cli/src/run/noninteractive.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/run/noninteractive.ts) · [packages/cli/src/run/run.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/run/run.ts) · [packages/cli/src/commands/commands.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/commands/commands.ts) · [packages/core/src/tool/plugin/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts) · [packages/core/src/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill.ts) · [packages/core/src/skill/instructions.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill/instructions.ts) · [packages/core/src/config/plugin/skill-file.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/skill-file.ts) · [packages/protocol/openapi.json](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/protocol/openapi.json) · [packages/server/src/handlers/skill.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/server/src/handlers/skill.ts) · [github/action.yml](https://github.com/anomalyco/opencode/blob/v2.0.22/github/action.yml) · tests [packages/core/test/tool-skill.test.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/test/tool-skill.test.ts), [packages/core/test/skill/instructions.test.ts](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/test/skill/instructions.test.ts)
- elevenlabs/skills: [evals/run_all.py](https://github.com/elevenlabs/skills/blob/main/evals/run_all.py) · [evals/text-to-speech/evals.json](https://github.com/elevenlabs/skills/blob/main/evals/text-to-speech/evals.json)
- vercel-labs/skills: [ci.yml](https://github.com/vercel-labs/skills/blob/main/.github/workflows/ci.yml) · [agents.yml](https://github.com/vercel-labs/skills/blob/main/.github/workflows/agents.yml) · [tests/installer-symlink.test.ts](https://github.com/vercel-labs/skills/blob/main/tests/installer-symlink.test.ts)
- mattpocock/skills: [CLAUDE.md](https://github.com/mattpocock/skills/blob/main/CLAUDE.md) · [native-question-tool.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md)
- cursor/plugins: [validate-plugins.yml](https://github.com/cursor/plugins/blob/main/.github/workflows/validate-plugins.yml)

**Local (this machine):**

- `claude --version` 2.1.294; `claude plugin --help`, `claude plugin eval --help`, `claude plugin validate --help`; `claude plugin validate` runs against a scratch fixture plugin (not in the repo).
- `~/.claude/skills/synced/*/skill-creator/` (same scripts as anthropics/skills; `quick_validate.py` differs slightly).
