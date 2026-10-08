# Harness-specific content in skills, and Codex `agents/openai.yaml`

Research date: 2026-10-08. This doc builds on [tool-agnostic-skills-repo.md](tool-agnostic-skills-repo.md) and does not repeat it. It answers two questions:

- **Q9:** How can a skill carry content that differs per harness (Claude Code, Codex, opencode)?
- **Q15:** What exactly does Codex's `agents/openai.yaml` do, and what are the equivalents elsewhere?

Sources read at these commits (shallow clones):

- `openai/codex` at `845345b` (2026-10-08)
- `anomalyco/opencode` at tag `v2.0.22` (`527f0b9`, 2026-10-02). This is the opencode 2.x line, and the version installed on this machine (`opencode v2.0.22`).
- `sst/opencode` at `3884062` (2026-10-08). Its `packages/opencode` is version `1.18.35`, the 1.x line. The public opencode.ai docs describe 1.x behavior (see 3.3).
- `vercel-labs/skills` at `05bf938`, `anthropics/skills` at `683bc88`, `dyoshikawa/rulesync` at `f320e2f`, `agentskills/agentskills` at `69ef37e`
- Claude Code docs as served on 2026-10-08. CLI `claude 2.1.294`. This session ran in `2.1.292`.

GitHub links pin these commits. Code links to Codex use `845345b`.

Labels:

- **[verified]**: read in a primary source (vendor doc or source code) and linked.
- **[local probe]**: observed by running the installed CLI on this machine. Section 6 describes the probes.
- **[inference]**: my reasoning. No source states it.
- **[unverified]**: claimed somewhere but not confirmed, or not tested.

## TL;DR

- **Only Claude Code composes a skill at load time.** It runs `` !`cmd` `` blocks and substitutes `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`, and other variables. It does **not** expand `@file` imports inside `SKILL.md`: those work only in `CLAUDE.md`, `AGENTS.md`, and rules files. Codex and opencode 2.x inject the skill body verbatim. opencode 1.x runs `` !`cmd` ``, `$ARGUMENTS`, and `@file` only when the *user* runs the skill as a `/command`. When the model loads the same skill through the `skill` tool, it gets the raw text.
- **Each harness exports environment variables to its shell commands:**
  - Claude Code: `CLAUDECODE=1`
  - Codex: `CODEX_THREAD_ID` and `CODEX_CI=1`
  - opencode: `OPENCODE=1` and `AGENT=1`

  All of them are inherited when one harness runs inside another. A probe of opencode started from Claude Code's shell saw `CLAUDECODE=1` *and* `OPENCODE=1`. That is exactly how your `opencode-runner` setup works. So no single variable identifies the innermost harness. [verified + local probe]
- **Each system prompt names its harness:**
  - Claude Code: "You are Claude Code, Anthropic's official CLI for Claude".
  - Codex: "You are Codex, …" in every bundled model's instructions.
  - opencode 2.x: "You are an AI agent running in OpenCode".

  Custom system prompts and overrides remove these lines: Codex `model_instructions_file`, opencode agent `system`, and the Agent SDK's minimal default prompt. [verified]
- **Q9 recommendation:** keep skill bodies harness-neutral. Where a difference can't be avoided, use **option (a)**: a short routing block in `SKILL.md` that points to `harness/<harness>.md`. The model's own identity is the primary signal. A small detection script is the fallback, with the nesting caveat stated. Don't use `` !`…` `` in shared skills. Hold the build step (option c) in reserve. If you need it, Codex can be pointed at a generated tree through `.codex-plugin/plugin.json`, whose `skills` key *replaces* Codex's default scan. Claude Code's `skills` key *adds* to its default scan.
- **`agents/openai.yaml` schema** (from source):
  - `interface`: `display_name`, `short_description`, `icon_small`, `icon_large`, `brand_color`, `default_prompt`
  - `policy`: `allow_implicit_invocation`, `products`
  - `dependencies`: `tools[]` with `type`, `value`, `description`, `transport`, `command`, `url`, `oauth.callback_port`

  A missing or invalid file is ignored, and loading continues. [verified]
- **Effect of `allow_implicit_invocation: false`.** The skill drops out of the model's skill catalog and out of the model-facing `skills.list` and `skills.read` tools. It **still appears** in the TUI `$` popup and the `/skills` menu, and `$name` still injects its body. The app-server protocol doesn't even carry `policy` to the TUI. Without `openai.yaml`, the skill shows its frontmatter `name` and `description` (or `metadata.short-description`) and is implicitly invocable. [verified]
- **Codex ignores `disable-model-invocation`.** Its frontmatter parser reads only `name`, `description`, and `metadata.short-description`. **opencode 2.x has its own equivalent:** `metadata: { "opencode/autoinvoke": "false" }` keeps a skill out of `<available_skills>`. It is documented only in the 2.x repo docs, not on opencode.ai. opencode 1.x has only the per-user permission `"skill": { "<name>": "deny" }`. [verified]

---

## 1. Q9.1: Load-time composition per harness

### Claude Code

[verified: [Claude skills doc](https://code.claude.com/docs/en/skills), sections "Inject dynamic context" and "Available string substitutions"]

**Dynamic context injection.** "The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder."

- The inline form is recognized "only when `!` appears at the start of a line or immediately after whitespace". Multi-line commands use a fenced block opened with ` ```! `.
- Substitution runs once. "Command output is inserted as plain text and is not re-scanned."
- Commands run through the Bash tool (or PowerShell with `shell: powershell`). They share the session shell's working directory, timeout, and output handling.
- "A failed command aborts the entire skill invocation."
- Commands are checked against permission rules. Outside auto mode, anything other than *allow* aborts the invocation. In auto mode, the skill loads "with an instruction telling Claude to run the command first".
  - [local probe] A command containing `$CLAUDECODE` rendered as `[run this first, exactly as written, and use its output: …]`, even though `allowed-tools: Bash(echo *)` was set. A plain `echo probe-ok` was replaced by its output.
- `"disableSkillShellExecution": true` in settings replaces each command with `[shell command execution disabled by policy]`.

**String substitutions:**

| Placeholder | Meaning |
|---|---|
| `$ARGUMENTS` | Full argument string. If no placeholder receives the arguments, Claude Code appends them as `ARGUMENTS: <value>` |
| `$ARGUMENTS[N]`, `$N` | One argument by 0-based index |
| `$name` | A named argument from the `arguments:` frontmatter list |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_EFFORT}` | Current effort level |
| `${CLAUDE_SKILL_DIR}` | Directory that holds the skill's `SKILL.md` |
| `${CLAUDE_PROJECT_DIR}` | Project root |
| `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` | Plugin root and plugin data directory. Plugin skills only |

`${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` are also substituted inside `allowed-tools` Bash rules, so a bundled script can be pre-approved.

**`@file` imports.** Imports are documented only for memory files: "CLAUDE.md files can import additional files using `@path/to/import` syntax", and they are expanded inside `AGENTS.md` too ([memory doc](https://code.claude.com/docs/en/memory)). The skills doc never mentions `@` imports. Its pattern for supporting files is Markdown links such as `[reference.md](reference.md)` that "Claude knows … when to load".

- [local probe] A `SKILL.md` line `@ref.md` reached the model as literal text. The session transcript contains no occurrence of `ref.md`'s unique token. **So `@file` is not a skill include mechanism in Claude Code 2.1.294.**

**Rendered header.** [local probe] The invoked skill message starts with `Base directory for this skill: <abs path>`, so relative paths resolve without `${CLAUDE_SKILL_DIR}`.

### Codex

[verified, Codex source]

**No template features.** For a host skill, the provider reads the file text and returns it unchanged ([`provider/host.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/provider/host.rs) `read`). The explicit-invocation fragment wraps it as `<skill><name>…</name><path>…</path>{contents}</skill>`, again with no substitution ([`fragments.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/fragments.rs) `SkillInstructions::body`).

**Codex treats Claude's syntax as unsupported.** Its importer for Claude and Cursor plugin `commands/` skips any command whose body contains `$ARGUMENTS`, `$<digit>`, `{{…}}`, `` !` ``, or an `@token` ([`command_migration.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/command_migration.rs) `has_unsupported_command_template_features`).

**Implicit invocation goes through a file read.** The catalog prompt tells the model to "open and read its `SKILL.md` completely", to "resolve [relative paths] relative to the directory containing that expanded `SKILL.md` first", and, when "variants exist (frameworks, providers, domains), pick only the relevant reference file(s)" ([`catalog_prompt.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/catalog_prompt.rs) `SKILLS_HOW_TO_USE_WITH_HOST_ALIASES`). So "read `harness/codex.md`" fits the progressive-disclosure behavior Codex already asks for. [inference]

**8 KB truncation.** When the user invokes a skill explicitly (`$name`), Codex injects at most `MAX_SKILL_PROMPT_BYTES = 8_000` bytes of the file and warns "Skill `X` exceeded the main prompt context limit and was truncated." ([`render.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/render.rs) line 21, [`extension.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/extension.rs) around line 465, [`host_prompt.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/host_prompt.rs) line 80). This limit is far below the Agent Skills guidance of "<5000 tokens". **That favors a short `SKILL.md` that routes to side files.** [inference]

The [Codex skills doc](https://learn.chatgpt.com/docs/build-skills) mentions no template variables or includes. [verified]

### opencode 2.x (installed, 2.0.22)

[verified, `anomalyco/opencode` v2.0.22]

**Raw body.** `Skill.toModelOutput` wraps the raw body as `<skill_content name="…"># Skill: …\n{content}\nBase directory for this skill: {dir}\n…<skill_files>…</skill_files></skill_content>` ([`core/src/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill.ts)).

- The `skill` tool uses it ([`tool/plugin/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts)).
- User `@skill` attachments also use it ([`session/prompt.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/session/prompt.ts) lines 56-75).
- No substitution happens on either path.
- [local probe] Loading the probe skill in opencode returned `${CLAUDE_SKILL_DIR}` and `` !`echo probe-ok` `` as literal text.

**Command templating is commands-only.** Commands (`.opencode/commands/*.md`) get `$N`, `$ARGUMENTS`, and `` !`cmd` `` shell interpolation ([`config/plugin/command.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/command.ts) `evaluateTemplate`, regexes at lines 247-250). That code never touches skills.

### opencode 1.x (sst/opencode main, opencode.ai docs)

[verified, `sst/opencode` `3884062`]

**Model path: raw.** The `skill` tool returns the raw body in the same `<skill_content>` wrapper ([`tool/skill.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/tool/skill.ts)).

**User path: templated.** Every skill is also registered as a command with `source: "skill"` ([`command/index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/command/index.ts) lines 134-150). Running `/name` sends the body through the command pipeline ([`session/prompt.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/session/prompt.ts) around lines 1372-1432, and `resolvePromptParts` around line 157):

- `$N` and `$ARGUMENTS` are substituted. Arguments are appended if no placeholder uses them.
- `` !`cmd` `` runs through the configured shell. No permission check appears on this path.
- `@path` attaches a file resolved from the **worktree**, or from `~/` for home paths, not from the skill directory. If no file exists at that path, it tries an agent name instead. `FILE_REGEX` is `/(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g` ([`config/markdown.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/config/markdown.ts)).

[inference] So in 1.x the same `SKILL.md` renders differently depending on who invoked it. A stray `@scripts/x.sh` or `` !`…` `` in a shared skill can attach unrelated files, or run a command without a permission prompt.

### Summary

| | `` !`cmd` `` | `$ARGUMENTS` / `$N` | Skill-dir variable | `@file` in SKILL.md | Base dir told to model |
|---|---|---|---|---|---|
| Claude Code | yes (permission-checked) | yes | `${CLAUDE_SKILL_DIR}` | no | yes |
| Codex | no | no | no | no | path in catalog and `<path>` |
| opencode 2.x | no | no | no | no | yes |
| opencode 1.x, `/skill` by user | yes (no prompt seen) | yes | no | yes (worktree-relative) | yes |
| opencode 1.x, `skill` tool by model | no | no | no | no | yes |

## 2. Q9.2: Environment signals visible to shell commands

### Claude Code

[verified: [env-vars doc](https://code.claude.com/docs/en/env-vars)]

Documented variables Claude Code sets in its subprocesses:

| Variable | Value | Where it is set |
|---|---|---|
| `CLAUDECODE` | `1` | Bash and PowerShell tools, tmux, hooks, status line, stdio MCP servers. IDE terminals also set it |
| `CLAUDE_CODE_SESSION_ID` | session ID | Bash, PowerShell, hooks, MCP |
| `CLAUDE_EFFORT` | effort level | Bash, hooks |
| `CLAUDE_PID` | Claude Code's PID | Bash, PowerShell, hooks |
| `CLAUDE_CODE_CHILD_SESSION` | `1` | Bash, PowerShell, Monitor, hooks, status line. Not MCP |
| `CLAUDE_CODE_REMOTE` | `true` | Cloud sessions only |

[local probe] This session's Bash tool also had these. The env-vars doc does not list them:

- `CLAUDE_CODE_ENTRYPOINT=cli`
- `AI_AGENT=claude-code_2-1-292_agent`
- `CLAUDE_CODE_EXECPATH=…`

`` !`cmd` `` injection runs through the same Bash tool, so the same variables are visible there ([skills doc](https://code.claude.com/docs/en/skills) "How injected commands run"). [verified]

### Codex

[verified, source]

Codex's only shell tool is unified exec (`exec_command` in [`shell_spec.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/tools/handlers/shell_spec.rs)). For each command, it builds the environment in [`unified_exec/process_manager.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/unified_exec/process_manager.rs) `open_session_with_sandbox`, around line 1433:

| Variable | Value | Source |
|---|---|---|
| `CODEX_THREAD_ID` | thread ID | Inserted per command. `create_env` re-adds it "even when `include_only` is set" ([`protocol/src/shell_environment.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/protocol/src/shell_environment.rs) line 167) |
| `CODEX_SESSION_ID` | session ID | `inject_session_env` ([`core/src/exec_env.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/exec_env.rs)) |
| `CODEX_VERSION` | crate version | `inject_session_env` |
| `CODEX_TOOL_CALL_ID` | tool call ID | `set_tool_call_id_env_var` |
| `CODEX_CI` | `1` | `UNIFIED_EXEC_ENV`, applied after the env policy |
| `CODEX_PERMISSION_PROFILE` | profile name | "Informational … must not be treated as proof of enforcement" |
| `CODEX_SANDBOX` | `seatbelt` | Only when the command runs under the macOS seatbelt sandbox ([`core/src/sandboxing/mod.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/sandboxing/mod.rs) around line 181) |
| `CODEX_SANDBOX_NETWORK_DISABLED` | `1` | Only when the network sandbox policy is on |

`UNIFIED_EXEC_ENV` also sets `NO_COLOR=1`, `TERM=dumb`, and `PAGER=cat`. **The most robust Codex markers are `CODEX_THREAD_ID` and `CODEX_CI=1`.** `CODEX_SANDBOX` is absent in unsandboxed or non-macOS runs.

### opencode

[verified, source + local probe]

- **2.x:** the shell tool sets `AGENT=1`, `OPENCODE=1`, `OPENCODE_SESSION_ID=<id>`, and `AI_AGENT ||= "opencode"` on every invocation ([`tool/plugin/shell.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/shell.ts) lines 210-213). `||=` means an inherited `AI_AGENT` wins.
- **1.x:** the CLI sets `process.env.AGENT = "1"`, `OPENCODE = "1"`, and `OPENCODE_PID` at startup, so every child process inherits them ([`src/index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/index.ts) lines 75-77).
- **`OPENCODE_CLIENT`** is set only by the desktop app (`"desktop"`) and ACP mode (`"acp"`) ([`desktop/src/main/lifecycle/environment.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/desktop/src/main/lifecycle/environment.ts), [`cli/src/commands/handlers/acp.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/commands/handlers/acp.ts)).

### Nesting leaks variables

[local probe] `opencode run` started from this Claude Code session ran `env` in its shell tool. The output was:

```
AI_AGENT=claude-code_2-1-292_agent   # inherited from Claude Code; opencode's ||= did not override it
CLAUDECODE=1                          # inherited
AGENT=1
OPENCODE=1
OPENCODE_SESSION_ID=<set>
```

None of the three harnesses clears another harness's variables. So a detection script can't tell "opencode inside Claude Code" from "Claude Code inside opencode" by presence alone. [inference from the probe plus the source above, none of which unsets foreign variables]

### Prior art

`vercel-labs/skills` detects the running agent with `@vercel/detect-agent`. Its test helper lists the variables that package checks: `AI_AGENT`, `CLAUDECODE`, `CLAUDE_CODE`, `CODEX_CI`, `CODEX_SANDBOX`, `CODEX_THREAD_ID`, `OPENCODE_CLIENT`, `CURSOR_AGENT`, `GEMINI_CLI`, and others ([`src/test-utils.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/test-utils.ts), [`src/detect-agent.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/detect-agent.ts)). [verified]

[inference] That list keys opencode on `OPENCODE_CLIENT`, which the 2.x TUI and CLI don't set. I didn't read the package source to check whether it also checks `OPENCODE`. [unverified]

Other prior art:

- `openai/skills` scripts branch on `CODEX_SANDBOX` ([`screenshot/scripts/ensure_macos_permissions.sh`](https://github.com/openai/skills/blob/49f948f/skills/.curated/screenshot/scripts/ensure_macos_permissions.sh)). [verified]
- Anthropic's skill-creator strips `CLAUDECODE` before nesting `claude -p` ([`run_eval.py`](https://github.com/anthropics/skills/blob/683bc88/skills/skill-creator/scripts/run_eval.py) line 83). [verified]

## 3. Q9.3: Does the model know its harness?

### 3.1 What each system prompt says

[verified unless marked]

| Harness | Identity text | Source |
|---|---|---|
| Claude Code | "You are Claude Code, Anthropic's official CLI for Claude". Subagents get "You are an agent for Claude Code, Anthropic's official CLI for Claude." | [local] this session's system prompt and subagent prompt. The docs describe the `claude_code` preset as "the system prompt that the Claude Code CLI uses" ([modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)) but don't quote it |
| Codex, current models | "You are Codex, an agent based on GPT-6…" (gpt-6-*). "You are Codex, an agent based on GPT-5…" (gpt-5.6-*, gpt-5.5) | `model_messages.instructions_template` in [`models-manager/models.json`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/models.json) |
| Codex, fallback | "You are a coding agent running in the Codex CLI…" | [`models-manager/prompt.md`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/prompt.md), used as `BASE_INSTRUCTIONS` ([`model_info.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/src/model_info.rs) line 16) |
| opencode 2.x, default and Claude models | "You are an AI agent running in OpenCode, a coding agent harness." Claude models get `anthropic.txt` *appended* to it | [`session/runner/prompt/system.txt`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/session/runner/prompt/system.txt), [`plugin/optimize.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/optimize.ts) |
| opencode 2.x, GPT | same line (`gpt.txt`, `gpt-astra.txt`) | [`plugin/system-prompt/`](https://github.com/anomalyco/opencode/tree/v2.0.22/packages/core/src/plugin/system-prompt) |
| opencode 2.x, Kimi/Meta/Trinity | "You are OpenCode…" / "You are opencode…" | same directory |
| opencode 2.x, all models | An identity plugin also inserts "# Your Model" with the name, provider, and model ID | [`plugin/identity.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/identity.ts) |
| opencode 1.x | "You are OpenCode, the best coding agent on the planet." (`anthropic.txt`, `codex.txt`). "You are opencode, an interactive CLI tool…" (`default.txt`) | [`session/prompt/`](https://github.com/sst/opencode/tree/3884062/packages/opencode/src/session/prompt) |

### 3.2 When the identity line disappears

[verified]

- **Codex:** `model_instructions_file` "will override the built-in instructions for the selected model" ([`config_toml.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/config/src/config_toml.rs) line 271).
- **opencode 2.x:** the optimize plugins skip agents that define their own `system` prompt ([`optimize.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/optimize.ts) `if (… .data.system) return`).
- **Claude Agent SDK:** without `systemPrompt` it "uses a minimal prompt that … omits the rest of the `claude_code` preset's content". A custom string "sends only what you provide" ([modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)).

### 3.3 Is self-identification reliable?

[inference] In the default configuration of each CLI, every harness names itself in the first sentence of the system prompt. Tool names are a second cue: `Skill`/`Agent` in Claude Code, `exec_command` in Codex, `skill`/`<skill_content>` in opencode.

I did not measure how often models act on this. In a skill, ask the model to *state* its harness before branching, so mistakes show up in transcripts. [unverified]

## 4. Q9.4: The three options for segov-stack

### (a) SKILL.md routes the model to `harness/<harness>.md`

**Shape** [inference]:

```markdown
## Harness notes
Before step 3, read the file for the harness you are running in:
`harness/claude-code.md`, `harness/codex.md`, or `harness/opencode.md`.
Your system prompt names your harness. If it doesn't, run `scripts/harness.sh` and use its output.
```

`scripts/harness.sh` [inference], ordered for your own nesting pattern (Claude Code driving opencode):

```sh
#!/bin/sh
# Prints claude-code | codex | opencode | unknown.
# Harness env vars leak into nested harnesses, so check the ones most likely to be innermost first.
if [ "${OPENCODE:-}" = 1 ]; then echo opencode
elif [ -n "${CODEX_THREAD_ID:-}" ] || [ "${CODEX_CI:-}" = 1 ]; then echo codex
elif [ "${CLAUDECODE:-}" = 1 ]; then echo claude-code
else echo unknown; fi
```

**How each harness resolves the relative path:**

- Claude Code and opencode print "Base directory for this skill: …" with the body (section 1).
- Codex tells the model to resolve relative paths from the `SKILL.md` directory (section 1).

So `harness/<x>.md` resolves in all three without harness variables. [verified for the headers. The full read-then-follow flow is inference]

**Costs** [inference]:

- One extra file read per invocation, only for skills that need harness notes.
- The model might skip the read, or pick the wrong file. That is mitigated by the self-identification cue and by evals (see `docs/research/testing-skills.md`).
- The script misreports when Claude Code runs inside Codex or opencode. That is rare, but it is not your `opencode-runner` direction.

**Prior art:**

- Anthropic's `claude-api` skill says "detect the project language, then read the relevant language-specific documentation", with per-language `{lang}/` directories ([SKILL.md](https://github.com/anthropics/skills/blob/683bc88/skills/claude-api/SKILL.md) lines 12 and 69). This is the same routing mechanism, keyed on language instead of harness. [verified]
- Anthropic's `skill-creator` keeps per-surface sections inline, such as "## Claude.ai-specific instructions" and "## Cowork-Specific Instructions". Those sections rely on the model knowing where it runs ([SKILL.md](https://github.com/anthropics/skills/blob/683bc88/skills/skill-creator/SKILL.md) lines 420-450). [verified]
- mattpocock/skills deliberately avoids harness branches ([native-question-tool.md](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md), already covered in the prior doc). [verified]

### (b) Native load-time injection

Only Claude Code executes `` !`…` `` for every invocation, and only after a permission check (section 1).

- **Codex and opencode 2.x:** the model sees the literal `` !`cat harness/claude-code.md` `` text.
- **opencode 1.x:** the command runs only on a user `/skill` invocation, with different rules (no prompt, worktree-relative `@`).

A Claude-only injection gains nothing over a static file. The Claude Code variant could just be inline text. Use injection only for live data, such as `git status`, in a skill that already accepts being Claude-only. Example: claude-plugins-official's `claude-security` uses `` !`date -u …` `` ([SKILL.md](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/claude-security/skills/claude-security/SKILL.md) line 32). [verified usage. The assessment is inference]

**Verdict: not usable for shared skills.** [inference]

### (c) Build step generating per-harness outputs

How each installer would consume committed generated trees:

**Claude Code** [verified: [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), [manifest reference](https://code.claude.com/docs/en/plugins-reference)]

- `claude plugin marketplace add owner/repo`, `owner/repo@ref`, or `owner/repo#ref` reads `.claude-plugin/marketplace.json`.
- Entry `source` can be a relative path (must start with `./`, no `..`), `github {repo, ref, sha}`, `url`, `git-subdir {url, path, ref, sha}`, `npm`, `archive`, or `command`.
- The `command` source is a build that runs at install time: "Directory printed by a command Claude Code runs on the user's machine", re-run once per session.
- The plugin's `skills` key **adds to** the default `skills/` scan. So the generated Claude variant must *be* `skills/`, and the source must live elsewhere, for example `src/skills/`.

**Codex** [verified source]

- `codex plugin marketplace add owner/repo --ref <ref>` (and `--sparse`) is in [`cli/src/marketplace_cmd.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/cli/src/marketplace_cmd.rs) line 63.
- Codex looks for marketplaces in `.agents/plugins/marketplace.json` **before** `.claude-plugin/marketplace.json`. The first match wins ([`marketplace.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/marketplace.rs) `find_marketplace_manifest_path`).
- Entry sources: a `"./path"` string, `local`, `url {url, path, ref, sha}`, `git-subdir`, or `npm`. **A Claude `github` source object is "unsupported" and the plugin is skipped with a warning** (`RawMarketplaceManifestPluginSourceObject`, around line 1046).
- `.codex-plugin/plugin.json` beats `.claude-plugin/plugin.json` (prior doc). Its `skills` path **replaces** the default `skills/` scan: `plugin_skill_roots` uses `default_skill_roots` only "if manifest_paths.skills.is_empty()" ([`loader.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/loader.rs) line 1100).
- The path must start with `./` and stay under the plugin root ([`manifest.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/manifest.rs) line 607).
- **Result:** one branch, one marketplace entry `"./"`, and a `.codex-plugin/plugin.json` with `"skills": "./dist/codex/skills/"` gives Codex its own tree while Claude Code reads `skills/`. [inference from verified precedence]

**`npx skills add`** [verified: [`source-parser.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/source-parser.ts), [`skills.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/skills.ts), [`plugin-manifest.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/plugin-manifest.ts)]

- It accepts `owner/repo#ref`, `#ref@skill`, and GitHub `…/tree/<ref>/<subpath>` URLs.
- It searches `skills/` plus the `skills` arrays in `.claude-plugin/plugin.json` and `marketplace.json`. It ignores `.codex-plugin`.
- One run installs one copy for every agent selected with `-a`, linked into each agent's directory.
- So an opencode variant needs its own command, such as `npx skills add https://github.com/<you>/segov-stack/tree/main/dist/opencode -a opencode`. A plain `npx skills add <you>/segov-stack -a opencode` installs the Claude variant from `skills/`. [inference from the parser and discovery code]
- The installer does rewrite content per agent, but only frontmatter for its `eve` target (`stripIgnoredEveFrontmatter` in [`installer.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/installer.ts)). A repo can't hook into that. [verified]

**Prior art for (c):**

- **rulesync** generates per-tool skill files from `.rulesync/skills/*/SKILL.md`, with per-tool frontmatter sections (`claudecode:`, `codexcli:`, `opencode:`). It maps root `disable-model-invocation: true` to `policy.allow_implicit_invocation: false` in a generated `agents/openai.yaml` ([file-formats.md](https://github.com/dyoshikawa/rulesync/blob/f320e2f/docs/reference/file-formats.md) around line 985). I found no per-tool *body* variants in its docs. [verified frontmatter. Body: unverified]
- **Codex's own importer** copies `.claude/skills/*` into `.agents/skills/` and rewrites "claude code", "claude", and similar terms to "Codex", and `CLAUDE.md` to `AGENTS.md` ([`external-agent-migration/src/rewrite.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/external-agent-migration/src/rewrite.rs), [`service.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/external-agent-migration/src/service.rs) `import_skills`). [verified]
- **Your `port-pstack.py`** (prior doc). [local]

**Costs** [inference]:

- Generated files in git, and a CI check that the regenerated output equals the committed output.
- Three install commands to document.
- Users who install the "wrong" route silently get the Claude variant.
- Reviewers read diffs twice.

## 5. Q15: Codex `agents/openai.yaml`

### 5.1 Schema

[verified source]

The file is `agents/openai.yaml` next to `SKILL.md` (`SKILLS_METADATA_DIR`/`SKILLS_METADATA_FILENAME` in [`ext/skills/src/loader/mod.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/mod.rs)). It is parsed by [`loader/metadata.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/metadata.rs) and [`skills/src/interface.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/interface.rs):

```yaml
interface:                 # all optional; whitespace collapsed to one line
  display_name: "…"        # ≤64 chars
  short_description: "…"   # ≤1024 chars
  icon_small: ./assets/x.svg   # must be under the skill's assets/ (plugin skills may use ../ into <plugin>/assets/)
  icon_large: ./assets/x.png
  brand_color: "#3B82F6"   # must be #RRGGBB
  default_prompt: "…"      # ≤1024 chars
policy:
  allow_implicit_invocation: false   # default true
  products: [codex, chatgpt, atlas]  # skill loads only for these products; empty = all
dependencies:
  tools:
    - type: mcp            # required, ≤64
      value: openaiDeveloperDocs   # required
      description: "…"
      transport: streamable_http
      command: "…"
      url: https://developers.openai.com/mcp
      oauth: { callbackPort: 8765 }  # alias callback_port
```

How the parser handles bad input:

- **Fails open.** A missing file, an unreadable file, or invalid YAML is logged as "ignoring …", and the skill loads without metadata.
- **Bad fields are dropped one at a time.** An out-of-range field is dropped with a warning.
- **`products` is enforced at load time.** Skills are filtered with `matches_product_restriction_for_product` ([`loader/host_merge.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/host_merge.rs) line 151). A code TODO says selection and injection don't gate on it yet ([`skills/src/model.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/model.rs)).

The [Codex docs](https://learn.chatgpt.com/docs/build-skills) show the same `interface`, `policy`, and `dependencies` example. They don't mention `products`. [verified]

### 5.2 `allow_implicit_invocation: false`

[verified source]

| Surface | Hidden? | Evidence |
|---|---|---|
| Model's skill catalog in the prompt | **Yes** | `catalog_entry_from_skill` calls `hidden_from_prompt()` when `!allows_implicit_invocation()` ([`provider/host.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/provider/host.rs) line 165). Renderers filter on `is_model_visible() = enabled && prompt_visible` ([`catalog.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/catalog.rs) line 261, [`render_dedup.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/render_dedup.rs)) |
| Model tools `skills.list` / `skills.read` | **Yes** | Both filter `is_model_visible()` ([`tools/list.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/tools/list.rs) line 91, [`tools/read.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/tools/read.rs) line 93) |
| Explicit `$name` / skill mention | **No, still works** | `collect_explicit_skill_mentions` matches `entry.enabled && entry.name == name` and ignores `prompt_visible` ([`selection.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/selection.rs) line 72). The body is injected, with a `<resource_access>` hint added *because* the skill is hidden ([`extension.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/extension.rs) line 486) |
| TUI `$` popup and `/skills` → "List skills" / "Enable/Disable Skills" | **No, still listed** | The app-server `SkillMetadata` has no `policy` field ([`app-server-protocol/src/protocol/v2/plugin.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs) line 468). `skills_to_info` copies only `enabled` ([`catalog_processor.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/app-server/src/request_processors/catalog_processor.rs)). The TUI filters only on `skill.enabled` ([`tui/src/chatwidget/skills.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/tui/src/chatwidget/skills.rs) `enabled_skills_for_mentions`) |

The docs agree: when `false`, "requires explicit "$skill" mention only" ([Codex docs](https://learn.chatgpt.com/docs/build-skills)). [verified]

**With no `openai.yaml`:**

- `allows_implicit_invocation()` defaults to `true` ([`skills/src/model.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/model.rs)).
- Display name: `interface.display_name`, else `"<skill> (<plugin>)"` for a namespaced plugin skill such as `segov-stack:foo`, else `name`.
- Description: `interface.short_description`, else frontmatter `metadata.short-description`, else `description` ([`tui/src/skills_helpers.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/tui/src/skills_helpers.rs)).
- Plugin skills are named `<plugin>:<skill>` ([`loader/namespace.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/namespace.rs)).
- The `$` popup inserts `$<name>`.

### 5.3 `disable-model-invocation` and its equivalents

**Codex ignores it.** [verified] `SkillFrontmatter` deserializes only `name`, `description`, and `metadata.short-description`. Other keys are dropped ([`skills/src/parser.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/parser.rs)). The string `disable-model-invocation` appears in the Codex tree only inside a memory-consolidation prompt template ([`memories/write/templates/memories/consolidation.md`](https://github.com/openai/codex/blob/845345b/codex-rs/memories/write/templates/memories/consolidation.md) line 722), not in any parser.

**opencode 2.x:**

- [verified source + repo docs] The frontmatter schema reads `name`, `description`, and `metadata` ([`config/plugin/skill-file.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/skill-file.ts)). `disable-model-invocation` is ignored.
- `metadata["opencode/autoinvoke"]` (`"false"` or YAML `false`) sets `autoinvoke`. `SkillInstructions` drops such skills from `<available_skills>` ([`skill/instructions.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill/instructions.ts) line 76).
- The `skill` tool still loads such a skill by exact ID. It never checks `autoinvoke` ([`tool/plugin/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts)).
- The TUI Skills dialog and `@` autocomplete list every skill ([`tui/src/component/dialog-skill.tsx`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/tui/src/component/dialog-skill.tsx), [`prompt/autocomplete.tsx`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/tui/src/component/prompt/autocomplete.tsx) line 427).
- Repo docs: "Skills with `metadata["opencode/autoinvoke"]` set to `"false"` are not included in `<available_skills>`. They can still be selected manually and loaded by exact name" ([`web/src/content/docs/skills.mdx`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/web/src/content/docs/skills.mdx)).
- [local probe] opencode loaded a skill marked `disable-model-invocation: true` through its `skill` tool without complaint.

**opencode 1.x and opencode.ai:**

- [verified] The live [opencode.ai skills doc](https://opencode.ai/docs/skills/) lists five fields, says "Unknown frontmatter fields are ignored", and has no `opencode/autoinvoke`.
- The only control is the permission system, `"permission": { "skill": { "<pattern>": "allow" | "deny" | "ask" } }`. `deny` hides the skill from the list and rejects the tool call ([`skill/index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/skill/index.ts) line 314, [`tool/skill.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/tool/skill.ts) `ctx.ask`).

**The permission route is user-only in both versions.** User-initiated paths skip the skill permission: the 2.x `@skill` attachment (`session/prompt.ts` lines 56-75 load it with no permission call) and the 1.x `/skill` command. So `"skill": {"x": "deny"}` behaves like "user-only", but it lives in each user's `opencode.json` and can't ship with the skill. [verified source. The "behaves like" is inference]

**`opencode/slash`.** The 2.x repo docs also document `metadata["opencode/slash"]` ("expose the skill as a `/name` command"). I found no code reading it in `packages/core` or `packages/schema` at v2.0.22. [unverified]

## 6. Probes run

[local probe]

All probes ran in `/private/tmp/claude-501/.../scratchpad/probe-claude`, a throwaway git repo, with `.claude/skills/probe/SKILL.md` and a `ref.md` holding a unique token.

1. **Claude Code:** `claude -p "/probe hello-arg" --model haiku` on 2.1.294.
   - `${CLAUDE_SKILL_DIR}` was substituted, `$ARGUMENTS` became `hello-arg`, and `` !`echo probe-ok` `` became `probe-ok`.
   - `@ref.md` stayed literal. The token is absent from both session JSONL transcripts.
   - The body started with "Base directory for this skill: …".
2. **opencode:** `opencode run --standalone --auto -m opencode-go/deepseek-v4.1-flash …` on 2.0.22, started from this Claude Code session.
   - The shell env showed `AGENT=1`, `OPENCODE=1`, `OPENCODE_SESSION_ID`, *plus* the inherited `CLAUDECODE=1` and `AI_AGENT=claude-code_2-1-292_agent`.
   - The `skill` tool output kept `${CLAUDE_SKILL_DIR}` and `` !`echo probe-ok` `` literal.
3. **This session's Bash environment:** `CLAUDECODE=1`, `CLAUDE_CODE_ENTRYPOINT=cli`, `AI_AGENT=claude-code_2-1-292_agent`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `CLAUDE_CODE_CHILD_SESSION`.
4. **Codex:** not run. The local Codex CLI install is broken. All Codex findings come from source.

## 7. Recommendations

### Q9: harness-specific markdown

1. **Default: one harness-neutral body.** No `` !`…` ``, no `${CLAUDE_*}`, no `$ARGUMENTS`, no bare `@path` tokens. Bare `@path` attaches files in opencode 1.x. Refer to files with Markdown links or backticked relative paths. **[copied: mattpocock/skills, prior doc]**
2. **When a step truly differs per harness: option (a).**
   - Add a `harness/` folder inside that skill, holding only `claude-code.md`, `codex.md`, and `opencode.md`.
   - Add a three-line routing block in `SKILL.md` that names the files and says the system prompt identifies the harness. Ask the model to state the harness it picked.
   - Keep a shared `scripts/harness.sh` (section 4a) as a fallback. Its check order favors your Claude-drives-opencode nesting.
   - **[copied: claude-api's "detect, then read `{lang}/`" routing. Harness keying, the script, and its order are inference]**
3. **Keep `SKILL.md` under about 8 KB** and push detail into side files. Codex truncates explicitly invoked skills at 8,000 bytes. **[inference from Codex source]**
4. **Don't use (b)** in shared skills. Only Claude Code executes it on every invocation. **[inference]**
5. **Keep (c) in reserve** for when evals show (a) misroutes. If you adopt it:
   - Author in `src/skills/` and generate `skills/` (Claude Code; also what `npx skills` installs by default).
   - Generate `dist/codex/skills/`, read through a root `.codex-plugin/plugin.json` with `"skills": "./dist/codex/skills/"`, and generate `dist/opencode/skills/` for an `npx skills … /tree/main/dist/opencode -a opencode` route.
   - Keep the marketplace entry `"source": "./"`. Codex skips `github` objects.
   - Add a CI diff check.
   - **[inference built on verified precedence. rulesync and Codex's importer are partial prior art]**

### Q15: invocation control

1. **Keep mattpocock's mirrored pair** for user-invoked skills: `disable-model-invocation: true` in `SKILL.md` and `policy.allow_implicit_invocation: false` in `agents/openai.yaml`. **[copied: mattpocock invocation.md]**
2. **Add `metadata: { "opencode/autoinvoke": "false" }`** to the same skills. It is a string value under the spec's `metadata` map, so it stays spec-valid and harmless elsewhere: Codex reads only `metadata.short-description`, and Claude Code doesn't interpret `metadata`. It hides the skill from opencode 2.x's model list. **[inference from opencode 2.x source and docs. No repo I read does this yet]**
3. **Extend the planned `validate.mjs` invariant to all three markers** (`disable-model-invocation`, `allow_implicit_invocation: false`, `opencode/autoinvoke: "false"`). Validate `openai.yaml` against the 5.1 schema too, because Codex drops bad fields silently: `display_name` ≤64, `brand_color` `#RRGGBB`, icons under `assets/`. **[inference]**
4. **Tell users what "user-invoked" means in each harness:**
   - Claude Code blocks model calls.
   - Codex hides the skill from the model, while the `$` picker still lists it.
   - opencode 2.x hides it from the list, but the model can still load it by exact ID.
   - opencode 1.x enforces it only through a user's own `"permission": {"skill": {...: "deny"}}`.

   **[verified behaviors. The wording is inference]**
5. **`openai.yaml` is optional for model-invoked skills.** Without it, Codex shows `name` and `description`. Add `interface.short_description` (or frontmatter `metadata.short-description`) only when `description` is long trigger text that reads badly in the `$` popup. **[inference from the TUI fallback order]**

## Open / unverified points

- **Codex is source-only.** Nothing was run, because the local CLI install is broken. In particular, the TUI listing of implicit-off skills and the 8 KB truncation weren't observed live.
- **`@file` in Claude Code SKILL.md.** The no-import result is from one probe on 2.1.294 plus doc silence. Anthropic doesn't document it either way.
- **Undocumented Claude Code variables.** `AI_AGENT` and `CLAUDE_CODE_ENTRYPOINT` were observed locally only. Whether Claude Code overwrites an inherited `AI_AGENT` wasn't tested.
- **opencode `opencode/slash`.** Documented in the 2.x repo docs but not found in 2.0.22 core code.
- **opencode docs split.** opencode.ai still describes 1.x. Users on 1.x won't get `opencode/autoinvoke`, and their `/skill` path does template expansion.
- **`@vercel/detect-agent` internals** weren't read. The variable list comes from vercel-labs/skills' test helper.
- **Self-identification reliability** wasn't measured. Option (a) needs an eval per harness, routing to the right file in N/N runs, before relying on it.
- **Nested-harness detection** has no clean signal. Process-tree checks (`CLAUDE_PID`, `OPENCODE_PID` in 1.x) might separate the cases. Untested.

## Sources

**Vendor docs:**

- Claude Code: [skills](https://code.claude.com/docs/en/skills) · [memory / imports](https://code.claude.com/docs/en/memory) · [env vars](https://code.claude.com/docs/en/env-vars) · [modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts) · [create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces) · [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference) · [manifest reference](https://code.claude.com/docs/en/plugins-reference)
- Codex: [skills / agents/openai.yaml](https://learn.chatgpt.com/docs/build-skills)
- opencode: [skills (1.x, opencode.ai)](https://opencode.ai/docs/skills/) · [skills (2.x repo docs)](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/web/src/content/docs/skills.mdx)
- Agent Skills: [specification](https://github.com/agentskills/agentskills/blob/69ef37e/docs/specification.mdx) · [client implementation guide, "Filtering"](https://github.com/agentskills/agentskills/blob/69ef37e/docs/client-implementation/adding-skills-support.mdx)

**openai/codex @ `845345b` (`codex-rs/…`):**

- Skills: [`skills/src/parser.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/parser.rs) · [`skills/src/model.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/model.rs) · [`skills/src/interface.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/skills/src/interface.rs) · [`ext/skills/src/loader/mod.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/mod.rs) · [`loader/metadata.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/metadata.rs) · [`loader/namespace.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/namespace.rs) · [`loader/host_merge.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/loader/host_merge.rs) · [`provider/host.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/provider/host.rs) · [`provider/executor.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/provider/executor.rs) · [`catalog.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/catalog.rs) · [`catalog_prompt.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/catalog_prompt.rs) · [`selection.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/selection.rs) · [`extension.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/extension.rs) · [`fragments.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/fragments.rs) · [`render.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/render.rs) · [`host_prompt.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/host_prompt.rs) · [`tools/list.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/tools/list.rs) · [`tools/read.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/ext/skills/src/tools/read.rs)
- TUI and app-server: [`tui/src/skills_helpers.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/tui/src/skills_helpers.rs) · [`tui/src/chatwidget/skills.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/tui/src/chatwidget/skills.rs) · [`tui/src/bottom_pane/mentions_v2/search_catalog.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/tui/src/bottom_pane/mentions_v2/search_catalog.rs) · [`app-server-protocol/src/protocol/v2/plugin.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs) · [`app-server/src/request_processors/catalog_processor.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/app-server/src/request_processors/catalog_processor.rs)
- Shell environment: [`core/src/exec_env.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/exec_env.rs) · [`protocol/src/shell_environment.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/protocol/src/shell_environment.rs) · [`core/src/unified_exec/process_manager.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/unified_exec/process_manager.rs) · [`core/src/sandboxing/mod.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/sandboxing/mod.rs) · [`core/src/spawn.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/spawn.rs) · [`core/src/tools/handlers/shell_spec.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core/src/tools/handlers/shell_spec.rs)
- Prompts and config: [`models-manager/models.json`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/models.json) · [`models-manager/prompt.md`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/prompt.md) · [`models-manager/src/model_info.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/models-manager/src/model_info.rs) · [`config/src/config_toml.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/config/src/config_toml.rs)
- Plugins and marketplaces: [`core-plugins/src/marketplace.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/marketplace.rs) · [`core-plugins/src/manifest.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/manifest.rs) · [`core-plugins/src/loader.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/loader.rs) · [`core-plugins/src/command_migration.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/core-plugins/src/command_migration.rs) · [`cli/src/marketplace_cmd.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/cli/src/marketplace_cmd.rs)
- Claude import and memories: [`external-agent-migration/src/rewrite.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/external-agent-migration/src/rewrite.rs) · [`external-agent-migration/src/service.rs`](https://github.com/openai/codex/blob/845345b/codex-rs/external-agent-migration/src/service.rs) · [`memories/write/templates/memories/consolidation.md`](https://github.com/openai/codex/blob/845345b/codex-rs/memories/write/templates/memories/consolidation.md)

**anomalyco/opencode @ `v2.0.22` (`packages/…`):**

- Skills: [`core/src/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill.ts) · [`core/src/skill/instructions.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/skill/instructions.ts) · [`core/src/config/plugin/skill-file.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/skill-file.ts) · [`core/src/config/plugin/compatibility.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/compatibility.ts) · [`core/src/tool/plugin/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/skill.ts) · [`core/src/session/prompt.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/session/prompt.ts) · [`schema/src/skill.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/schema/src/skill.ts)
- Commands and shell: [`core/src/config/plugin/command.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/config/plugin/command.ts) · [`core/src/tool/plugin/shell.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/tool/plugin/shell.ts)
- Prompts: [`core/src/plugin/optimize.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/optimize.ts) · [`core/src/plugin/identity.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/plugin/identity.ts) · [`core/src/plugin/system-prompt/`](https://github.com/anomalyco/opencode/tree/v2.0.22/packages/core/src/plugin/system-prompt) · [`core/src/session/runner/prompt/system.txt`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/session/runner/prompt/system.txt)
- Clients and TUI: [`desktop/src/main/lifecycle/environment.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/desktop/src/main/lifecycle/environment.ts) · [`cli/src/commands/handlers/acp.ts`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/cli/src/commands/handlers/acp.ts) · [`tui/src/component/dialog-skill.tsx`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/tui/src/component/dialog-skill.tsx) · [`tui/src/component/prompt/autocomplete.tsx`](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/tui/src/component/prompt/autocomplete.tsx)

**sst/opencode @ `3884062` (1.18.35, `packages/opencode/src/…`):**

- [`index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/index.ts) · [`tool/skill.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/tool/skill.ts) · [`skill/index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/skill/index.ts) · [`command/index.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/command/index.ts) · [`session/prompt.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/session/prompt.ts) · [`config/markdown.ts`](https://github.com/sst/opencode/blob/3884062/packages/opencode/src/config/markdown.ts) · [`session/prompt/`](https://github.com/sst/opencode/tree/3884062/packages/opencode/src/session/prompt)

**Other repos:**

- vercel-labs/skills @ `05bf938`: [`src/detect-agent.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/detect-agent.ts) · [`src/test-utils.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/test-utils.ts) · [`src/source-parser.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/source-parser.ts) · [`src/skills.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/skills.ts) · [`src/plugin-manifest.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/plugin-manifest.ts) · [`src/installer.ts`](https://github.com/vercel-labs/skills/blob/05bf938/src/installer.ts)
- anthropics/skills @ `683bc88`: [`claude-api/SKILL.md`](https://github.com/anthropics/skills/blob/683bc88/skills/claude-api/SKILL.md) · [`skill-creator/SKILL.md`](https://github.com/anthropics/skills/blob/683bc88/skills/skill-creator/SKILL.md) · [`skill-creator/scripts/run_eval.py`](https://github.com/anthropics/skills/blob/683bc88/skills/skill-creator/scripts/run_eval.py)
- anthropics/claude-plugins-official: [`claude-security/SKILL.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/claude-security/skills/claude-security/SKILL.md)
- openai/skills @ `49f948f`: [`screenshot/scripts/ensure_macos_permissions.sh`](https://github.com/openai/skills/blob/49f948f/skills/.curated/screenshot/scripts/ensure_macos_permissions.sh)
- dyoshikawa/rulesync @ `f320e2f`: [`docs/reference/file-formats.md`](https://github.com/dyoshikawa/rulesync/blob/f320e2f/docs/reference/file-formats.md)
- mattpocock/skills: [`.agents/invocation.md`](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md) · [`.out-of-scope/native-question-tool.md`](https://github.com/mattpocock/skills/blob/main/.out-of-scope/native-question-tool.md)

**Local:** probes in section 6. This session's system prompt and Bash environment.
