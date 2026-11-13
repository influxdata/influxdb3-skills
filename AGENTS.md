## Agent skills

### Issue tracker

Track issues in GitHub Issues. For issue operations, see `.agents/issue-tracker.md`.

### Triage labels

For the canonical triage label mapping, see `.agents/triage-labels.md`.

### Domain docs

This repository uses a single context. Before exploring, read `.agents/domain.md` and `.agents/CONTEXT.md`.

### Git hooks

This repository uses plain Git hooks in `.githooks/`. Enable them with `git config core.hooksPath .githooks`, as `TESTING.md` describes.
Don't install prek, Lefthook, or pre-commit in this repository.
Don't add or remove files in `.git/hooks` unless the user asks.
CI runs the same checks, so a missing hook doesn't let a bad change merge.
