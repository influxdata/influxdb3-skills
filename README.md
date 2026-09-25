# influxdb3-skills

Agent skills that teach AI coding agents to write correct InfluxDB 3 code, manage databases and tokens, develop Processing Engine plugins, and troubleshoot when things break — for **Core and Enterprise**, in **Python, JavaScript/TypeScript, Go, Java, C#**, or **raw HTTP**.

Stands alone — no MCP server required.

**Status:** v0.7.0 (unreleased). Two skills, versioned together with the plugin. Distributed as a plugin for Claude Code, Codex, and other agents from this repo. Version history in [`CHANGELOG.md`](CHANGELOG.md); roadmap in [What it does NOT cover yet](#what-it-does-not-cover-yet).

> **Reviewers:** if you've been invited to review this skill, start with [`TESTING.md`](TESTING.md) and your area-specific briefing under [`evals/reviewer-briefings/`](evals/reviewer-briefings/).

## What it does

The plugin contains two skills. Each loads automatically when its topics come up in a conversation with your agent.

### `influxdb3` skill — application + admin work

- **Get InfluxDB 3 running** — Core and Enterprise install (official script + Docker), operator-token bootstrap, `/ping` verification. For users who don't have a server yet.
- **Connect & authenticate** — env-var driven, never inlines tokens, `.gitignore` enforcement.
- **Detect Core vs. Enterprise** — auto-probe `/ping` and inspect the `x-influxdb-build` and `x-influxdb-version` response headers, with a polite ask-the-user fallback when ambiguous.
- **Write data** — line protocol, batching rules, retriable vs. non-retriable error handling, the whole-batch-rejects-on-one-bad-line gotcha.
- **Query data** — v3 SQL by default, parameterized user input, sensible pagination, time-bucket patterns.
- **Design schemas** — tag-vs-field decisions, cardinality guidance, naming conventions, type stability.
- **Provision databases** — create / list / update (retention) / delete via CLI and HTTP API.
- **Manage tokens** — admin and scoped resource tokens (`db:<name>:read,write`), the safe rotation pattern (create-new → swap-secret → revoke-old, never the wrong order), listing via `system.tokens`.
- **Automate admin work in any of 6 client paths** — full lifecycle examples for Python, JavaScript/TypeScript, Go, Java, C#, and raw HTTP, each verified end-to-end against a live Enterprise instance.
- **Troubleshoot when things break** — symptom-keyed router for auth failures, silent-auto-create misroutes, write/query failures, admin failures, and plugin-runtime issues. Includes a redaction rule that never echoes a customer-pasted token, even partially.
- **Run a diagnostic toolkit** — Python script that produces a one-page health report (ping, flavor detection, list-DBs, write+query smoke against a throwaway DB) — the right thing to paste into your agent when something feels off.
- **Recognize broken→fix patterns** — five worked demo pairs covering the most common quirks (silent auto-create, admin-token-at-data-plane, `table_batches` attribute access, `system.tokens.permissions` parsing, HEAD-on-/ping).

### `influxdb3-plugins` skill — Processing Engine plugin development

- **Develop plugins** — the `influxdb3_local` runtime API, `LineBuilder`, the `Cache`, and the three entry-point signatures (`process_writes`, `process_scheduled_call`, `process_request`). Knows that `table_batches` items are dicts, not class instances.
- **Install plugins** — `--upload`, `PUT /api/v3/plugins/files`, the `gh:` prefix for the official plugin repo, custom `--plugin-repo`.
- **Test plugins** — `influxdb3 test wal_plugin` / `test schedule_plugin` for offline simulation, plus the live-trigger iteration loop using `system.processing_engine_logs` (verified column names: `event_time`, `trigger_name`, `log_level`, `log_text`) and `influxdb3 update trigger`.
- **Manage plugin dependencies** — `influxdb3 install package` against the embedded venv. Will not propose `python -m venv` against system Python.
- **Maintain state across runs** — trigger-local and global cache namespaces with TTLs.
- **Diagnose plugin runtime problems** — trigger-doesn't-fire checks, dependency `ImportError`s, `table_batches` gotchas, cache lifecycle issues.

Both skills cover all three trigger types and single-node deployments. Multi-node cluster patterns are deferred — see [What it does NOT cover yet](#what-it-does-not-cover-yet).

## Install

The skills follow the [Agent Skills specification](https://agentskills.io/specification),
so any agent that supports the format can load them.

> **GitHub access:** the repo is internal to InfluxData, so installs use your existing GitHub credentials.
> If adding the marketplace fails with a 401 or 403, run `gh auth login` (GitHub.com, HTTPS) once, then retry.

### Claude Code

```text
/plugin marketplace add influxdata/claude-skill-for-influxdb3
/plugin install influxdb3-skills@influxdata-influxdb3
```

Claude Code namespaces plugin skills, so the skills load as
`influxdb3-skills:influxdb3` and `influxdb3-skills:influxdb3-plugins`.
If they don't appear right away, run `/reload-plugins`.

To update later:

```text
/plugin marketplace update influxdata-influxdb3
/plugin update influxdb3-skills@influxdata-influxdb3
```

### Codex

```sh
codex plugin marketplace add influxdata/claude-skill-for-influxdb3
codex plugin add influxdb3-skills@influxdata-influxdb3
```

Start a new thread so Codex loads the skills.

### Other agents

The root `plugin.json` follows the [Agent Plugins](https://agent-plugins.org) format,
so clients that support Agent Plugins can install the repository as a plugin.

To install the skills into any agent that reads Agent Skills, use the
[`skills` CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add influxdata/claude-skill-for-influxdb3
```

Or copy the directories under `skills/` to the location where your agent reads skills.

If you don't have InfluxDB 3 running yet, ask your agent. The skill walks you through it.

### Develop locally

To install your working copy instead of the published version, clone the repo:

```bash
git clone https://github.com/influxdata/claude-skill-for-influxdb3.git ~/Projects/influxdb3-skills
```

In Claude Code, remove the published marketplace first, because both use the name `influxdata-influxdb3`:

```text
/plugin uninstall influxdb3-skills@influxdata-influxdb3
/plugin marketplace remove influxdata-influxdb3
/plugin marketplace add ~/Projects/influxdb3-skills
/plugin install influxdb3-skills@influxdata-influxdb3
```

Claude Code reads a local marketplace from the directory's working tree, so it uses whatever branch is checked out.
To test a branch, check it out or add its worktree directory as the marketplace.
After you edit files, start a new session to load the changes.

### Validate

CI runs these checks on every pull request. To run them locally:

```sh
for skill in skills/*/; do
  uvx --from "git+https://github.com/agentskills/agentskills@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref" \
    skills-ref validate "$skill"
done
scripts/check-versions.sh
```

## Use it

In any project that uses InfluxDB 3, write code as normal. The skill triggers when your agent sees imports of any official InfluxDB 3 client, references to line protocol, `INFLUXDB_*` env vars, admin keywords (`influxdb3 create token`, `/api/v3/configure/database`, etc.), or troubleshooting language ("getting a 401", "writes succeed but data isn't there", etc.).

If you want to test it cleanly:

> "I'm starting a new Python project that talks to InfluxDB 3 Core. Help me set up the connection and write 10 sample points."

## What it does NOT cover yet

When asked about any of the below, the skill defers to the official docs rather than guessing:

- **Performance tuning** — slow queries, cardinality remediation, batch-size optimization.
- **v1/v2 → v3 migration helper.**
- **App-pattern templates** — IoT pipelines, dashboards, alerts/downsampling.
- **Cluster placement & multi-node patterns for plugins.**
- **Full air-gapped setup** — offline mirrors and custom plugin repos.
- **Product-specific admin for InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered** — these products use different APIs for token and database management. The skill routes those tasks to each product's docs.
- **InfluxDB Cloud (TSM), InfluxDB Cloud 1, InfluxDB OSS v1, and InfluxDB OSS v2** — out of scope.

## Verifying the skill is fresh

Each `SKILL.md` records under `metadata:` the date and InfluxDB 3 versions its docs were checked against, and the date and versions it was last live-verified against, and, for `influxdb3`, the client library versions. If those are stale, the skill might be drifting from the product — open an issue.

## Contributing

To make a change:

1. Edit the relevant `SKILL.md`, `references/`, or `examples/` file. Follow the evidence rules in [`docs/publishing.md`](docs/publishing.md).
2. Use full product names, never "Cloud" alone, and keep skill text agent-neutral.
3. Run the checks in [Validate](#validate) and the eval suite in [`evals/README.md`](evals/README.md). Adversarial cases must pass 100%.
4. Open a PR.

Reviewer-onboarding details, including the four-area review split for the current MVP review pass, are in [`TESTING.md`](TESTING.md).

## License

MIT — see [`LICENSE`](LICENSE).
