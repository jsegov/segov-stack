# Skills live in a flat `skills/<name>/` directory

Every skill sits directly under `skills/`, with no category folders, because Codex and the Agent Plugins spec only discover skills one level deep (the spec says clients "MUST NOT recursively search deeper"), Codex drops symlinks on install, and harnesses flatten skill names anyway. Grouping, when wanted, is a name prefix (`review-*`), and drafts live outside `skills/` so they don't ship.

## Considered Options

- **Bucketed `skills/<bucket>/<name>/`** (as in mattpocock/skills): rejected. It needs a hand-maintained `skills` path array in the manifest, works in Codex only on recent versions, is invalid under the Agent Plugins spec, and its buckets vanish once installed. See `docs/research/tool-agnostic-skills-repo.md`.
