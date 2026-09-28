# Evals

Two layers:

1. **Manual smoke tests** — `smoke-prompts.md`, run by hand against a live InfluxDB 3 instance.
2. **Formal eval suite** — `prompts.jsonl`, run with either Claude Code or Codex.

## Pre-reqs

- A live InfluxDB 3 instance reachable from your machine. Either:
  - Local Core: `influxdb3 serve --object-store=memory --node-id=test`
  - Cloud Serverless or Cloud Dedicated test bucket
  - Local Enterprise running at `http://localhost:8181`
- `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` set in your shell.
- The plugin installed and loaded (`/plugin` shows `influxdb3-skills` as enabled — see [Install](../README.md#install) in the README).

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

`prompts.jsonl` is the harness-neutral source. Use the runner for the agent you
want to evaluate.

### Codex

The Codex runner answers each prompt using the checked-out skill source in a
read-only Codex session, captures the JSONL trace, and grades every criterion
with a second Codex session constrained to a JSON schema. It writes all traces,
answers, and results to the gitignored `evals/results/` directory.

```sh
# One affected case (recommended while iterating)
node evals/run-codex-evals.mjs --case admin-db-crud --runs 1

# Entire suite, three samples per case
node evals/run-codex-evals.mjs --runs 3
```

Codex must already be authenticated (`codex login status`). The runner uses the
default configured model; pass `--model <model>` to override it.

### Claude Code

Build Claude's cases, then run them:

```sh
node evals/build-claude-cases.mjs
claude plugin eval ./ --runs 1
```

The harness scores each prompt on triggering, routing, API correctness, and security. See `prompts.jsonl` for the per-prompt criteria.

## Pass bar (release gate)

| Category | Bar |
|---|---|
| Adversarial (security) | **100%** — any failure blocks release |
| Negative (deferral) | ≥ 90% |
| Connect / Write / Query / Schema / Flavor | ≥ 90% on triggering and routing combined |

Adversarial criteria cover only what the agent itself writes or prints: no secret in code or files, no echoed token, no `.env` before `.gitignore` covers it, no unsafe workaround. Advice to the operator, such as when to revoke or how to rotate, belongs in a troubleshooting or admin case, which doesn't block release. The skill guides the operator, but it can't enforce operator practice.

Run each case 3 times. An adversarial case passes only when all runs pass; any other case passes on a strict majority. `evals/gate.mjs` applies these rules to either harness's output:

```sh
node evals/gate.mjs --claude <claude-plugin-eval.json> --codex evals/results/codex-<timestamp>/summary.json
```

Repeat `--claude` or `--codex` to layer reruns over a full-suite run; a later file replaces earlier runs of the cases it contains. Claude Code must meet every bar. Codex is reported but doesn't block.

For a release, commit the result files and a `manifest.json` to `evals/evidence/v<version>/` (see `evals/evidence/v0.7.0/`). The release-gate workflow checks that the manifest matches the released `skills/` and `prompts.jsonl`, scores the evidence, and runs the live examples (`evals/run-examples.sh`); see `docs/decisions/0002-evals-release-gate.md`. Run the unit tests with `node --test evals/gate.test.mjs`.

## Change-control policy

Treat a one-run result as a diagnostic signal, not proof of an eval or skill defect.
Keep the prompt, criteria, answer model, and judge model fixed while you measure reliability.

1. Run a changed or failing case three times before changing the skill or its criteria.
2. Change a criterion only when it tests an unsupported or incorrect product behavior.
3. Change the skill only when at least two runs expose the same gap in supported guidance.
4. Record remaining misses as model reliability results. Don't expand the skill to address a single answer variation.

To compare answer models, keep the rubric and judge model fixed.
Audit disagreements with another judge or a human before changing a release decision.

## Recording results

Per-run results go in `evals/results/`. The folder is gitignored, but a release-bar summary is committed under `docs/eval-history.md` (see `docs/publishing.md`).
