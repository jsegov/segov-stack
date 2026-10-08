# Skills ship as written, with no build step

Every installer (`claude plugin marketplace add`, `codex plugin marketplace add`, `npx skills add`) reads the repo straight from GitHub, so a skill's source folder is exactly what users get. When a skill genuinely needs different instructions per harness, `SKILL.md` tells the model to read `harness/<claude-code|codex|opencode>.md` for the harness it's running in, rather than a generator producing per-harness copies. Load-time injection was ruled out because only Claude Code supports it, and env-var detection because harness env vars leak when one harness runs another. See `docs/research/harness-specific-skill-content.md`.

## Considered Options

- **Build step emitting `dist/<harness>/`**: rejected for now. Generated output must be committed and kept in sync, the repo root stops being the plugin, and Codex would need its own `.codex-plugin/plugin.json` pointing at `dist/codex/skills`. Kept in reserve if runtime harness files prove unreliable.
