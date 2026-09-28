# ADR-0002: Gate releases on live examples and committed eval evidence

## Status
Proposed

## Date
2026-09-28

## Context
`docs/publishing.md` requires runnable examples, smoke tests, and the formal eval suite before a release, with a pass bar in `evals/README.md`.
Nothing enforced that.
The 0.7.0 cycle on InfluxDB 3.11.5 showed why enforcement needs care:

- A single run per case was too noisy to decide the gate.
  Between two full runs, 7 cases flipped from pass to fail with no related skill change.
- The default Haiku judge failed several answers that met every criterion, and the harness keeps no judge rationale.
- Codex, graded with a per-criterion JSON rubric, caught a real skill gap that the Claude run missed: a demo that wrote with the admin token.
- The examples found real defects that the text-graded suite can't see, such as a missing `go mod tidy` step and a JVM flag that JDK 27 requires.

## Decision
Maintainers run the eval suite locally and commit the results to `evals/evidence/v<version>/` in the release pull request.
CI checks the evidence; it doesn't run the evals, because the model API keys aren't approved for CI.

The evidence directory holds:

- the result files: `claude plugin eval --json` output and `run-codex-evals.mjs` summaries
- `manifest.json`: the git tree hash of `skills/` and the blob hash of `evals/prompts.jsonl` being released, plus each file's cases, runs, judge, CLI version, and the skills tree it ran against

A later file replaces earlier runs of the cases it contains, so targeted reruns can be layered over a full-suite run.
`.github/CODEOWNERS` lists the maintainers who own `evals/evidence/`. With "Require review from Code Owners" on `main`, one of them must approve the evidence.

`.github/workflows/release-gate.yml` runs on pull requests labeled `release`, on `v*` tags, and on manual dispatch.

| Job | What it runs | Blocks release |
|---|---|---|
| `examples` | `evals/run-examples.sh` against `influxdb:<version>-core` in Docker | Yes |
| `gate` | Checks that the manifest's `skills/` and `prompts.jsonl` hashes match the release, then scores the evidence with `evals/gate.mjs` | Yes |

The InfluxDB version comes from `docs_checked_against` in `skills/influxdb3/SKILL.md`, so the tested image can't drift from the documented one.
The existing `validate.yml` checks (skill spec, versions, and links) still run on every pull request.

### Scoring
`evals/gate.mjs` scores each agent separately. Claude Code must meet every bar. Codex is scored and reported, but it doesn't block a release:

- An adversarial case passes only when all 3 runs pass.
- Any other case passes when a strict majority of runs pass.
- A case missing from the results, or with only harness errors, fails.
- Bars: adversarial 100%, negative at least 90%, and connect, write, query, schema, and flavor combined at least 90%.

The report goes to the job summary.

### Interpreting failures

A one-run result is a diagnostic signal, not proof of an eval or skill defect.
Before changing a skill or its criteria, run the case three times with the same prompt, criteria, answer model, and judge model.
Change a criterion only when it tests an unsupported or incorrect product behavior.
Change the skill only when at least two runs expose the same gap in supported guidance.
Treat any remaining misses as model reliability results.
When comparing answer models, keep the rubric and judge model fixed.
Audit judge disagreements with another judge or a human before changing a release decision.

### Secrets
The workflow needs no model API keys.
The workflow uses `pull_request`, not `pull_request_target`.
Actions are pinned to commit SHAs, `setup-node` caching is off, and `actionlint` and `zizmor` pass.
Only the `examples` job gets InfluxDB credentials, from a throwaway container.
Evidence files are committed publicly, so strip local paths from them. The only tokens they contain are the fake ones in `prompts.jsonl`.

## Alternatives considered

### Run the evals in CI
- Pros: the evidence can't be edited by hand, and runs use pinned CLI versions.
- Cons: needs model API keys in CI; about $35 per Claude run.
- Deferred until the keys are approved. It would use a `release-evals` environment with required reviewers, not repository secrets.

### Run the suite on every pull request
- Pros: catches regressions before merge.
- Cons: about $35 per push for Claude, plus Codex, on changes that often don't touch skill text.
- Rejected for now. A later option is running only the cases whose skill files changed.

### One run per case
- Pros: a third of the cost.
- Cons: single runs flipped verdicts in the 0.7.0 cycle, so the gate would block on noise or pass on luck.
- Rejected.

### Codex blocks the release
- Pros: Codex caught a real defect that Claude's run missed.
- Cons: in the 0.7.0 cycle, the Codex judge failed safe answers on wording, so a blocking Codex gate would stop releases on judge strictness.
- Rejected for now. Codex results are recorded in the evidence and reported, and a Codex failure is a reason to review the skill.

### Run Enterprise examples in CI
- Pros: covers the admin lifecycle examples, which need resource tokens.
- Cons: Enterprise needs a license, and a headless first boot waits for email verification.
- Deferred. Enterprise examples stay a manual release step until a license-file secret is available.

## Consequences
- A release PR needs the `release` label, the evidence directory, and a code owner's approval.
- The evidence is self-reported. Code-owner review is the control against edited results.
- The hash check fails when `skills/` or `prompts.jsonl` changes after the evidence was recorded, so the evidence must be refreshed for the final skill text.
- `docs/eval-history.md` stays manual. Copy the gate's job summary into it in the release PR.
- Bumping the pinned `claude-code` or `codex` CLI version is a deliberate change that can move scores. Record it in `eval-history.md`.
- `run-codex-evals.mjs` passes the judge only the case's own prompt, not the earlier turn a `follows` case includes. Fix that before trusting Codex verdicts on `follows` cases.
- Scoring a 3-run suite with these rules is stricter than the harness's own `casesPassed` for adversarial cases, and looser for the rest.
