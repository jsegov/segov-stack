# segov-stack

segov-stack is my collection of agent skills, packaged so the same skills install in [Claude Code](https://code.claude.com), [Codex](https://github.com/openai/codex), and [opencode](https://opencode.ai). This README lists the skills, shows how to install them in each of those tools, and covers what you need to work on the repo itself.

All three tools load skills in the same `SKILL.md` format, but each installs skills its own way, and each has its own setting for a skill that should run only when you ask for it. This repo calls each tool a **harness**. Every skill here is written once, in wording that all three harnesses read the same way, and ships exactly as written. Before a skill ships, a check installs the repo into each harness and confirms every skill shows up.

## Skills

| Skill | What it does |
|---|---|
| `write` | Writes or rewrites a Markdown document for people, in my style: it sets the stage first, then takes the reader deeper one layer at a time. Runs only when you name it. |

A skill that runs only when you name it stays out of the agent's view until you call it, so the agent never picks it on its own. The install steps below say where to find these skills in each harness.

## Install

Install through one route per harness. Two routes into the same harness install every skill twice.

### Claude Code

```bash
claude plugin marketplace add jsegov/segov-stack
claude plugin install segov-stack@jsegov
```

Skills are named `/segov-stack:<skill>`, for example `/segov-stack:write`.

### Codex

```bash
codex plugin marketplace add jsegov/segov-stack
codex plugin add segov-stack@jsegov
```

Codex reads the same plugin files as Claude Code. Skills that run only when named are in the `$` menu.

### opencode

opencode has no plugin route for skills, so this one uses the [`skills`](https://github.com/vercel-labs/skills) installer, which also works for the other harnesses it supports.

```bash
npx skills@latest add jsegov/segov-stack -g -a opencode
```

Skills that run only when named are in the Skills dialog and in `@` autocomplete.

## Develop

Working on the repo needs Node 22 or later and all three harness CLIs, because the check runs each harness for real.

```bash
npm install
npm run new-skill -- my-skill --description "What it does and when to use it."
claude --plugin-dir .      # Claude Code: loads this checkout; run /reload-plugins after edits
npm run link               # Codex and opencode: symlinks skills/* into ~/.agents/skills
npm run check              # tests, lint, manifest validation, discovery in all three harnesses
```

The Claude Code part of the discovery step makes one short model call, so CI skips it and checks Codex and opencode only. Run `npm run check` locally before calling a skill done.

`AGENTS.md` has the rules for writing a skill that works in all three harnesses. `docs/adr/` records why the repo is shaped this way, and `docs/research/` holds the sourced findings behind those decisions.

## License

MIT
