# segov-stack

A public collection of any skill Jonathan Segovia writes, on any topic, written once and usable from several harnesses.

## Language

**Skill**:
A self-contained set of instructions, plus any files it references, that an agent loads to do one kind of task.
_Avoid_: command, prompt, playbook

**Harness**:
A coding-agent product that loads and runs skills.
_Avoid_: tool, client, agent, IDE

**Supported harness**:
A harness every skill is written and tested to work in: Claude Code, Codex, and opencode.
_Avoid_: target, platform

**User-invoked skill**:
A skill that runs only when the user names it; the model never picks it on its own.
_Avoid_: manual skill, command, slash command

**Harness note**:
The part of a skill written for one harness, read only when the skill runs there.
_Avoid_: harness override, variant, adapter

**Plugin**:
The installable unit that bundles the skills for a harness; segov-stack ships as exactly one.
_Avoid_: package, extension, bundle

**Marketplace**:
A catalog a harness reads to find and install plugins; segov-stack is its own marketplace.
_Avoid_: registry, store
