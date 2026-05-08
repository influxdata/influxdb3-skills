# Build process record (internal artifacts)

This folder holds the design specs and implementation plans used to build the `claude-influxdb3` plugin across versions v0.1.0 → v0.4.1, generated via the `superpowers:brainstorming` and `superpowers:writing-plans` Claude Code skills.

**Optional reading.** It's here for transparency about how the skill was built (and for future contributors who want to repeat the process for new versions). Reviewers and end users do not need to read any of it.

## What's in here

```
specs/   one design doc per version (v0.1, v0.2, v0.3, v0.4)
plans/   one implementation plan per version (the task list a subagent followed to build it)
```

## Caveats

- **These files are point-in-time records.** They include exact commands and paths from the original build machine (e.g. `/Users/<the-builder>/Projects/claude-influxdb3`, `localhost:8181`, an Enterprise 3.8.4 instance). Don't copy commands verbatim if you're on a different setup — adjust paths to match your environment.
- **They are not maintained as documentation.** If skill content changes, these specs and plans are NOT retroactively updated. The canonical user-facing docs are the SKILL.md files, the references, and the README.
- **They are not authoritative for behavior.** What ships in `skills/` is authoritative. If a plan says one thing and the skill content says another, the skill content wins.

## If you're starting v0.5.0+

Use the existing files as templates:

1. Run `superpowers:brainstorming` with the user to scope what's in v0.X.0.
2. Save the output to `specs/YYYY-MM-DD-<topic>-design.md`.
3. Run `superpowers:writing-plans` against that spec.
4. Save the output to `plans/YYYY-MM-DD-<topic>-vX.Y.0.md`.
5. Execute via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

The pattern stays the same; only the topic changes.
