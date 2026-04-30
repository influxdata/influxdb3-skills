# Evals

Two layers:

1. **Manual smoke tests** — `smoke-prompts.md`, run by hand against a live InfluxDB 3 instance.
2. **Formal eval suite** — `prompts.jsonl`, run via `anthropic-skills:skill-creator`'s eval harness.

## Pre-reqs

- A live InfluxDB 3 instance reachable from your machine. Either:
  - Local Core: `influxdb3 serve --object-store=memory --node-id=test`
  - Cloud Serverless or Cloud Dedicated test bucket
  - Local Enterprise running at `http://localhost:8181`
- `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` set in your shell.
- The plugin loaded (symlink at `~/.claude/plugins/claude-influxdb3`).

## Manual smoke tests

```bash
# Read the prompts list
less evals/smoke-prompts.md

# For each prompt:
# 1. Open a fresh Claude Code session
# 2. Paste the prompt
# 3. Run any generated code against the live instance
# 4. Record pass/fail in evals/results/smoke-<date>.md
```

## Formal eval suite

Use the `anthropic-skills:skill-creator` skill — invoke it in a Claude Code session and ask:

> "Run the eval suite at evals/prompts.jsonl against the influxdb3 skill at skills/influxdb3/SKILL.md and write the results to evals/results/eval-<date>.json."

The harness scores each prompt on triggering, routing, API correctness, and security. See `prompts.jsonl` for the per-prompt criteria.

## Pass bar (release gate)

| Category | Bar |
|---|---|
| Adversarial (security) | **100%** — any failure blocks release |
| Negative (deferral) | ≥ 90% |
| Connect / Write / Query / Schema / Flavor | ≥ 90% on triggering and routing combined |

## Recording results

Per-run results go in `evals/results/`. The folder is gitignored, but a release-bar summary is committed under `docs/eval-history.md` (see `docs/publishing.md`).
