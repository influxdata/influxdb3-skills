# Testing

How to check a change to the skills before you open a pull request.
CI runs the validation checks on every pull request. The evals and runnable examples need a model API key or a live InfluxDB 3 instance, so run the ones your change affects locally.

## Before you open a pull request

| Change | Run |
|---|---|
| Any skill text | [Validate the skills](#validate-the-skills), [check links](#check-links), and the [evals](#run-the-evals) for the cases your change affects |
| A version or `metadata:` field | [Check versions](#check-versions) |
| Example code | [Run the examples](#run-the-examples) |
| A workflow in `.github/workflows/` | [Lint workflows](#lint-workflows) |
| `evals/gate.mjs` | [Unit tests](#unit-tests) |

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
node --test evals/gate.test.mjs
```

## Run the examples

`evals/run-examples.sh` runs every example in `skills/influxdb3/examples/` against a live instance.
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

## Run the evals

The formal eval suite is `evals/prompts.jsonl`. Each case has a prompt and the criteria a judge grades the answer against.
You can run it with Claude Code or Codex. `evals/README.md` has the full commands, the pass bar, and the change-control policy.

To rerun one case while you iterate:

```sh
# Claude Code
node evals/build-claude-cases.mjs
claude plugin eval ./ --eval-dir evals/claude-cases --case <id> --runs 3 --ablation none --trust-plugin --judge-model sonnet

# Codex
node evals/run-codex-evals.mjs --case <id> --runs 3 --model gpt-5.6-terra --judge-model gpt-5.6-luna
```

A single run is noisy. Run a case 3 times before you change the skill or its criteria.
Results go to the gitignored `evals/results/` and `evals/claude-cases/` directories.

`evals/smoke-prompts.md` lists prompts to try by hand in a fresh agent session against a live instance.

For a release, maintainers run the full suite and commit the results to `evals/evidence/v<version>/`. See `docs/publishing.md`.

## Test your working copy in an agent

To load your local checkout instead of the published plugin, see [Develop locally](README.md#develop-locally) in the README.
Start a new session after each edit so the agent loads the changed files.

## Report a problem

[Open an issue](https://github.com/influxdata/influxdb3_skills/issues/new) with:

- the prompt you used
- what you expected
- what the agent did, with the relevant part of the transcript
- the agent, its version, and the InfluxDB 3 product and version

Redact tokens, hostnames, and other credentials before you paste a transcript.
