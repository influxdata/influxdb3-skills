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

See `TESTING.md` → "Run the evals" for the commands.

Codex must already be authenticated (`codex login status`). The runner defaults
to `gpt-6.1-sol` for both answers and judging; use `--model <model>`
and `--judge-model <model>` to override them. `gpt-6-luna` is a fast model for
easier tasks and was too weak a judge. These models were run with Codex CLI
0.166.0; update older clients before running the suite.

### Claude Code

See `TESTING.md` → "Run the evals" for the commands.
Sonnet answers gate the release by default, and Opus judges.
A maintainer can gate a release on Opus answers instead; the manifest records the model. 0.7.3 gates on Opus.
Sonnet costs less than half as much per suite run as Opus, and a skill that passes on Sonnet can be recommended to developers who use it.
Use full model IDs, not aliases: the CLI can remap an alias, and the result file doesn't record the resolved model.
Runs on models other than the release's gate model are comparisons: record their gate reports in `docs/eval-history.md`.
They don't block a release and don't go in the release manifest.

The harness scores each prompt on triggering, routing, API correctness, and security. See `prompts.jsonl` for the per-prompt criteria.

### Case fields

Every line of `prompts.jsonl` has `id`, `category`, `prompt`, and `criteria`, and may have `must_pass` and `follows`.
Three optional fields add graders and context. `evals/build-claude-cases.mjs` turns them into Claude Code grader files, and the Codex runner applies what it can.

| Field | Shape | Claude Code | Codex |
|---|---|---|---|
| `checks` | List of `{name, type: "regex", pattern, match, flags?, target?}` or `{name, type: "tool_used", tool, input_match?, min?, max?}` | A `regex` or `tool_used` grader per check | Runs `regex` checks on the final message; skips the rest |
| `skill_loaded` | Skill name, such as `"influxdb3"` | A `skill-loaded` grader that the `Skill` tool loaded it, scored on the trigger bar only | Not measured: the runner tells Codex to read the skill |
| `fixture` | `{"files": {"<relative path>": "<contents>"}}` | A scaffold that writes the files into the run's working directory; run with `--scaffold` | Shows the files in the prompt |

A regex `match` is `contains`, `not_contains`, or `count:N`.
Its `target` defaults to the final message (`last_message`); `trace` searches the run's tool calls and answers, and `{"file": "<path>"}` one written file.

Choose the grader by what the criterion checks:

- **`regex`** for a property of the text that has one right answer every run: a literal secret that must never appear, a forbidden path, a required header or flag. A regex gives the same verdict every run, so use it for every safety property an adversarial case blocks on.
- **`tool_used`** for what the agent did rather than what it said: that it read a named reference, or that it never called a tool.
- **`skill_loaded`** for cases whose prompt doesn't name InfluxDB, where the question is whether the skill triggers at all. Give such a case a `fixture` or a `follows` context, as a real project would have.
- **`criteria`** (the LLM judge) for anything that needs reading: whether advice is correct, whether a deferral comes first, whether code reads the token from the environment.

A run passes only when every grader passes, apart from `skill-loaded`.

## Pass bar (release gate)

| Category | Bar |
|---|---|
| Adversarial (security) | **100%** — any failure blocks release |
| Negative (deferral) | ≥ 90% |
| Install / Connect / Write / Query / Schema / Flavor | ≥ 90% on triggering and routing combined |

Adversarial cases cover only what the agent itself writes or prints, and each one blocks on at least one `regex` check that gives the same verdict every run: the pasted token never appears in the answer, no code writes to a filesystem path, the reply warns about committing `.env`, a stub is labeled as fake.
The judged criteria keep what needs reading, such as whether a workaround is unsafe or a recommendation fits the product.
Advice to the operator, such as when to revoke, how to rotate, or how long the plugin cache lasts, belongs in a plugin, troubleshooting, or admin case, which doesn't block release. The skill guides the operator, but it can't enforce operator practice.

Run each case 3 times. An adversarial case passes only when all runs pass; any other case passes on a strict majority. `evals/gate.mjs` applies these rules to either harness's output:

```sh
node evals/gate.mjs --claude <claude-plugin-eval.json> --codex evals/results/codex-<timestamp>/summary.json
```

Repeat `--claude` or `--codex` to layer reruns over a full-suite run; a later file replaces earlier runs of the cases it contains. Claude Code must meet every bar. Codex results are advisory until Codex meets the bars: `check-release.mjs verify` requires complete three-run Codex evidence but doesn't block on its bars or required cases.

Use `--require-case <id>` for each changed-behavior case and `--min-runs 3` when scoring release evidence.
Required cases must pass individually even when their category is outside the aggregate bars.
Incomplete three-run coverage blocks either agent.
Existing `must_pass` markers do not select required cases automatically.
The release manifest's explicit `required_cases` list selects them for CI.

For every skill-changing merge, store the full result files in the internal eval archive, and commit their runs files from `evals/slim-evidence.mjs` and `manifest.json` under the new shared package version.
See `docs/publishing.md` for the current manifest fields; historical manifests do not satisfy the new requirements automatically.
The release workflow runs even without a label and validates versioning, immutable evidence, full hashes, required cases, and three-run coverage through `node evals/check-release.mjs verify --base <target-commit>`.
It also runs Core application examples; Enterprise and plugin checks remain separate recorded obligations.
Run the eval tooling tests with `node --test evals/*.test.mjs`.

## Change-control policy

Treat a one-run result as a diagnostic signal, not proof of an eval or skill defect.
Keep the prompt, criteria, answer model, and judge model fixed while you measure reliability.

1. Run a changed or failing case three times before changing the skill or its criteria.
2. Change a criterion only when it tests an unsupported or incorrect product behavior.
3. Change the skill only when at least two runs expose the same gap in supported guidance.
4. Record remaining misses as model reliability results. Don't expand the skill to address a single answer variation.

Moving a criterion from the judge to a `regex` check doesn't change what the case tests, so rule 2 doesn't apply to it.
Move one only when the check gives the judge's per-criterion verdict on stored answers from at least two answer models.
Record the comparison in the changelog.
Keep a criterion with the judge when an answer could name the string only to warn against it, or when the criterion allows equivalents that a pattern can't list.

Rewrite a judged criterion when judges, or a judge and a maintainer, read it differently on the same answer.
State one condition that a reader can check in the answer, and match what the skill teaches.
Don't ask the judge whether code works or is correct beyond the stated condition: a judge can't run the code, and the skill can only point the agent to working examples, which the live example checks run.
When a condition depends on data, give concrete inputs and the expected result, such as a value the code must keep and one it must drop.
Record in the changelog which stored verdicts the rewrite targets, and re-score those answers before the release that uses it.

To compare answer models, keep the rubric and judge model fixed.
Audit disagreements with another judge or a human before changing a release decision.

## Compare judges

`evals/rescore.mjs` re-scores stored answers with candidate judges, so a judge comparison keeps the answers and criteria fixed and pays only for judge calls.
Every candidate gets the same prompt and the rubric schema in `codex-rubric.schema.json`, with its model and effort pinned. Claude judges run with `--safe-mode` and no tools; Codex judges run with `--ignore-user-config` in an empty directory.

1. `judge` grades each answer's criteria from the current `prompts.jsonl`, `--votes` times per judge (default 3), and writes one file per vote under `--out`. Rerunning the same command skips the votes already written and retries the ones that failed. Pass `--dry-run` to print the number of judge calls without making any.
2. `triage` takes each judge's majority verdict on each criterion and writes `split.md`: every criterion where the judges disagree, or where one judge has no majority. It shows each judge's quoted evidence as a numbered reader, in a different order for each item, so the sheet doesn't name the judge.
3. A maintainer writes `Label: P` or `Label: F` under each item in `split.md`.
4. `score` writes `report.md`. For each judge it reports agreement with the labels, agreement with the other judges' shared verdict on the criteria that didn't split, how often all its votes agree, its errors and safety-classifier refusals, and its cost.

```sh
node evals/rescore.mjs judge --out evals/results/rescore-<name> \
  --answers opus-79dee1f=evals/results/claude-opus-79dee1f.json \
  --answers sol-79dee1f=evals/results/codex-<timestamp> \
  --judge claude:claude-opus-5-5:medium --judge codex:gpt-6-astra:low \
  [--case id[,id...]] [--concurrency 4] [--dry-run]
node evals/rescore.mjs triage --out evals/results/rescore-<name>
node evals/rescore.mjs score --out evals/results/rescore-<name>
```

`--answers` takes a Claude Code result file or a Codex result directory, with an optional `label=` prefix.
`triage` refuses to replace a `split.md` that already has labels unless you pass `--force`.

## Recording results

Per-run results go in `evals/results/`. The folder is gitignored, but a release-bar summary is committed under `docs/eval-history.md` (see `docs/publishing.md`).
