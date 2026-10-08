# segov-stack

My agent skills, written once and installable in [Claude Code](https://code.claude.com), [Codex](https://github.com/openai/codex), and [opencode](https://opencode.ai).

## Install

Pick one route per harness. Two routes into the same harness install every skill twice.

**Claude Code**

```bash
claude plugin marketplace add jsegov/segov-stack
claude plugin install segov-stack@jsegov
```

Skills are then available as `/segov-stack:<skill>`.

**Codex**

```bash
codex plugin marketplace add jsegov/segov-stack
codex plugin add segov-stack@jsegov
```

**opencode** (and any other agent supported by [`skills`](https://github.com/vercel-labs/skills))

```bash
npx skills@latest add jsegov/segov-stack -g -a opencode
```

## Develop

Requires Node 22+ and the `claude`, `codex`, and `opencode` CLIs.

```bash
npm install
npm run new-skill -- my-skill --description "What it does and when to use it."
claude --plugin-dir .      # Claude Code: loads this checkout; run /reload-plugins after edits
npm run link               # Codex and opencode: symlinks skills/* into ~/.agents/skills
npm run check              # tests, lint, manifest validation, discovery in all three harnesses
```

`AGENTS.md` has the rules for writing skills. `docs/adr/` records why the repo is shaped this way.

## License

MIT
