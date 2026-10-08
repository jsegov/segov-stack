# segov-stack

Jonathan Segovia's skills, written once and shipped as one plugin to Claude Code, Codex, and opencode. Vocabulary lives in `GLOSSARY.md`, decisions in `docs/adr/`, and the sourced research behind them in `docs/research/`.

## Adding a skill

1. `npm run new-skill -- <name> --description "<what it does and when to use it>"`. Add `--user-invoked` for a skill that runs only when the user names it. Add `--draft` to start it in `drafts/`, which never ships; ship it later by moving its folder into `skills/`.
2. Write the skill, following the rules below.
3. Add a row for it to the Skills table in `README.md`: what it does, and "Runs only when you name it." if it is user-invoked.
4. Run `npm run check`. The skill is done when it passes with all three CLIs installed.

## Writing a skill

Every skill runs unchanged in all three harnesses, so its text is harness-neutral:

- Name another skill in plain words: "use the `grilling` skill".
- Describe subagents by their job: what each one receives, whether they run in parallel, and what each returns.
- Ask the user questions in plain prose.
- Reference the skill's own files by paths relative to its folder (`references/x.md`, `scripts/y.mjs`), as real files rather than symlinks.
- Keep `SKILL.md` under 8,000 bytes, because Codex truncates beyond that. Move detail into `references/`.
- Write the description as the trigger: lead with the task, then name each distinct case that should invoke it.

When behaviour genuinely differs per harness, put the differing part in `harness/claude-code.md`, `harness/codex.md`, and `harness/opencode.md` (all three), and have `SKILL.md` say: "Read `harness/<harness>.md` for the harness you are running in: claude-code, codex, or opencode." Harness notes are the one place for harness-specific tool names and paths (ADR 0002).

A user-invoked skill carries one flag per harness, and the three always change together: `disable-model-invocation: true`, `metadata: {"opencode/autoinvoke": "false"}`, and `agents/openai.yaml` with `policy.allow_implicit_invocation: false`.

`npm run lint` enforces the frontmatter keys, names, neutral wording, references, and flag agreement. Its messages say what to change.

## Scope

The plugin ships skills only, with no agents, hooks, or commands, so every harness gets the same thing. Skill folders stay flat under `skills/`; group related skills with a shared name prefix (ADR 0001).

The version lives only in `.claude-plugin/plugin.json`. Bump it when releasing.

## Scripts

Each script in `scripts/` has tests in `scripts/test/`, run by `npm test`. A change to a script comes with a test that fails without it.

- `scripts/test/fixtures/valid/` is a lint-clean repo. Tests copy it and break one thing.
- `scripts/test/fixtures/recorded/` holds real CLI output, trimmed, which the parsers are tested against. When a harness CLI changes its output, re-record from the real CLI.

`npm run discover` installs the repo into a throwaway home for each harness and checks every skill appears. It needs `claude`, `codex`, and `opencode` on PATH, or `CLAUDE_BIN`, `CODEX_BIN`, and `OPENCODE_BIN` pointing at them. The Claude Code check makes one short model call, so CI runs `--harness codex,opencode`.
