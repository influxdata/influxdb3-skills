# ADR-0002: Gate releases on live examples and the formal eval suite in CI

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
Add `.github/workflows/release-gate.yml`.
It runs on pull requests labeled `release`, on `v*` tags, and on manual dispatch.
It doesn't run on other pull requests, because a gated run costs about $35 for Claude alone.

| Job | What it runs | Blocks release |
|---|---|---|
| `examples` | `evals/run-examples.sh` against `influxdb:<version>-core` in Docker | Yes |
| `claude-evals` | `claude plugin eval` with 3 runs per case and a Sonnet judge | Yes, through `gate` |
| `codex-evals` | `evals/run-codex-evals.mjs` with 3 runs per case | Yes, through `gate` |
| `gate` | `evals/gate.mjs` scores both agents against the bar | Yes |

The InfluxDB version comes from `docs_checked_against` in `skills/influxdb3/SKILL.md`, so the tested image can't drift from the documented one.
The existing `validate.yml` checks (skill spec, versions, and links) still run on every pull request.

### Scoring
`evals/gate.mjs` scores each agent separately, and the gate passes only when every agent meets every bar:

- An adversarial case passes only when all 3 runs pass.
- Any other case passes when a strict majority of runs pass.
- A case missing from the results, or with only harness errors, fails.
- Bars: adversarial 100%, negative at least 90%, and connect, write, query, schema, and flavor combined at least 90%.

The report goes to the job summary.
Result files are uploaded as artifacts.

### Interpreting failures

A one-run result is a diagnostic signal, not proof of an eval or skill defect.
Before changing a skill or its criteria, run the case three times with the same prompt, criteria, answer model, and judge model.
Change a criterion only when it tests an unsupported or incorrect product behavior.
Change the skill only when at least two runs expose the same gap in supported guidance.
Treat any remaining misses as model reliability results.
When comparing answer models, keep the rubric and judge model fixed.
Audit judge disagreements with another judge or a human before changing a release decision.

### Secrets
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` live in a `release-evals` environment that requires reviewer approval.
The workflow uses `pull_request`, not `pull_request_target`, so fork pull requests never receive them.
Actions are pinned to commit SHAs, `setup-node` caching is off, and `actionlint` and `zizmor` pass.
The eval agents get no InfluxDB credentials; only the `examples` job does, from a throwaway container.

## Alternatives considered

### Run the suite on every pull request
- Pros: catches regressions before merge.
- Cons: about $35 per push for Claude, plus Codex, on changes that often don't touch skill text.
- Rejected for now. A later option is running only the cases whose skill files changed.

### One run per case
- Pros: a third of the cost.
- Cons: single runs flipped verdicts in the 0.7.0 cycle, so the gate would block on noise or pass on luck.
- Rejected.

### Codex as informational only
- Pros: no second provider in the critical path.
- Cons: Codex caught a real defect that Claude's run missed.
- Rejected. Codex blocks from the start.

### Run Enterprise examples in CI
- Pros: covers the admin lifecycle examples, which need resource tokens.
- Cons: Enterprise needs a license, and a headless first boot waits for email verification.
- Deferred. Enterprise examples stay a manual release step until a license-file secret is available.

## Consequences
- A release PR needs the `release` label and a reviewer approval for the `release-evals` environment.
- `docs/eval-history.md` stays manual. Copy the gate's job summary into it in the release PR.
- Bumping the pinned `claude-code` or `codex` CLI version is a deliberate change that can move scores. Record it in `eval-history.md`.
- `run-codex-evals.mjs` passes the judge only the case's own prompt, not the earlier turn a `follows` case includes. Fix that before trusting Codex verdicts on `follows` cases.
- Scoring a 3-run suite with these rules is stricter than the harness's own `casesPassed` for adversarial cases, and looser for the rest.
