# Testing

How to check a change to the skills before you open a pull request.
CI runs the validation checks on every pull request.
Every skill or prompt change also runs the release gate, even without a `release` label.
Run the full eval suite locally on final skill text and commit its evidence before merging a skill change.
The gate runs Core application examples; applicable Enterprise, plugin, and troubleshooting checks remain local obligations.

## Before you open a pull request

| Change | Run |
|---|---|
| Any skill text | [Validate the skills](#validate-the-skills), [check links](#check-links), and full final-text [eval evidence](#run-the-evals) before merge; use affected cases while iterating |
| A version or `metadata:` field | [Check versions](#check-versions) |
| Example code | [Run the examples](#run-the-examples) |
| A workflow in `.github/workflows/` | [Lint workflows](#lint-workflows) |
| Eval scoring or evidence validation | [Unit tests](#unit-tests) |

## Validate the skills

Each skill must pass the Agent Skills reference validator:

```sh
for skill in skills/*/; do
  uvx --from "git+https://github.com/agentskills/agentskills@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref" \
    skills-ref validate "$skill"
done
```

## Check versions

The plugin manifests and each `SKILL.md` must carry the same version:

```sh
scripts/check-versions.sh
```

## Check for home directories and secrets

Eval results record working directories, so tracked files must not contain a personal home directory such as `/Users/<name>` or `/home/<name>`.
`scripts/check-paths.sh` lists matches, and `scripts/check-paths.sh --fix` rewrites them to `/Users/USER`.
CI also scans the history and working tree with gitleaks, using `.gitleaks.toml`.
To run both checks before every commit, enable the hook once:

```sh
git config core.hooksPath .githooks
```

## Check links

CI checks links with [lychee](https://github.com/lycheeverse/lychee). To run the same check locally:

```sh
lychee --no-progress --max-retries 3 --exclude-loopback 'skills/**/*.md' README.md
```

## Lint workflows

Workflow actions are pinned to commit SHAs. Run both linters after you edit a workflow:

```sh
actionlint
zizmor .github/workflows/
```

## Unit tests

```sh
node --test evals/gate.test.mjs evals/check-release.test.mjs
```

## Run the examples

`evals/run-examples.sh` runs application client examples, schema examples, and the diagnostic toolkit against a live instance.
It copies the examples to a temporary directory, so dependency installs don't touch the repo, and it redacts tokens from its logs.
It needs Python (with `uv`), Node.js, Go, Java, and .NET.

To run it against a throwaway InfluxDB 3 Core container, as CI does:

```sh
docker run -d --name influxdb3-test -p 8181:8181 influxdb:3.11.5-core \
  serve --node-id test --object-store memory
export INFLUXDB_HOST=http://127.0.0.1:8181
export INFLUXDB_TOKEN=$(docker exec influxdb3-test influxdb3 create token --admin --format json | jq -r .token)
PRODUCT=core evals/run-examples.sh
docker rm -f influxdb3-test
```

Set `PRODUCT=enterprise` against an InfluxDB 3 Enterprise instance to also run the admin lifecycle examples, which need resource tokens.
The runner does not run Processing Engine round trips or the troubleshooting broken/fixed demonstrations.
Run those separately when applicable, following `docs/publishing.md`, and record cleanup results.

## Run the evals

The formal eval suite is `evals/prompts.jsonl`. Each case has a prompt and the criteria a judge grades the answer against.
You can run it with Claude Code or Codex. `evals/README.md` has the full commands, the pass bar, and the change-control policy.

To rerun one case while you iterate:

```sh
# Claude Code
node evals/build-claude-cases.mjs
claude plugin eval ./ --eval-dir evals/claude-cases --case <id> --runs 3 --ablation none --trust-plugin --judge-model sonnet

# Codex
node evals/run-codex-evals.mjs --case <id> --runs 3 --model gpt-6-luna --judge-model gpt-6-luna
```

A single run is noisy. Run a case 3 times before you change the skill or its criteria.
Results go to the gitignored `evals/results/` and `evals/claude-cases/` directories.

`evals/smoke-prompts.md` lists prompts to try by hand in a fresh agent session against a live instance.

For every skill-changing merge, maintainers run the full suite with three samples per case on both agents and commit the results to `evals/evidence/v<new-version>/`.
The manifest records full skills/prompt hashes, fixed model/judge/CLI versions, and explicit `required_cases` for changed behavior.
Required cases must pass individually, including plugin, admin, and troubleshooting cases outside the aggregate bars.
Use `node evals/check-release.mjs verify --base <target-commit>` on the committed candidate to check the same evidence as CI.
See `docs/publishing.md` for evidence review and live checks.

## Test your working copy in an agent

To load your local checkout instead of the published plugin, see [Develop locally](README.md#develop-locally) in the README.
Start a new session after each edit so the agent loads the changed files.

## Report a problem

[Open an issue](https://github.com/influxdata/influxdb3-skills/issues/new) with:

- the prompt you used
- what you expected
- what the agent did, with the relevant part of the transcript
- the agent, its version, and the InfluxDB 3 product and version

Redact tokens, hostnames, and other credentials before you paste a transcript.
