# claude-influxdb3

A Claude Code plugin that teaches Claude to write correct InfluxDB 3 code, manage databases and tokens, develop Processing Engine plugins, and troubleshoot when things break — across **Core, Enterprise, Cloud Serverless, and Cloud Dedicated**, in **Python, JavaScript/TypeScript, Go, Java, C#**, or **raw HTTP**.

Stands alone — no MCP server required.

**Status:** v0.4.1. Two skills (`influxdb3` v0.4.1, `influxdb3-plugins` v0.4.1). Distributed as a Claude Code plugin from this repo. Version history in [`CHANGELOG.md`](CHANGELOG.md); roadmap in [What it does NOT cover yet](#what-it-does-not-cover-yet).

> **Reviewers:** if you've been invited to review this skill, start with [`TESTING.md`](TESTING.md) and your area-specific briefing under [`evals/reviewer-briefings/`](evals/reviewer-briefings/).

## What it does

The plugin contains two skills. Each loads automatically when its topics come up in a Claude Code conversation.

### `influxdb3` skill — application + admin work

- **Get InfluxDB 3 running** — Core and Enterprise install (official script + Docker), operator-token bootstrap, `/ping` verification. For users who don't have a server yet.
- **Connect & authenticate** — env-var driven, never inlines tokens, `.gitignore` enforcement.
- **Detect the flavor** — auto-probe `/ping` to identify Core / Enterprise / Cloud Serverless / Cloud Dedicated, with a polite ask-the-user fallback when ambiguous.
- **Write data** — line protocol, batching rules, retriable vs. non-retriable error handling, the whole-batch-rejects-on-one-bad-line gotcha.
- **Query data** — v3 SQL by default, parameterized user input, sensible pagination, time-bucket patterns.
- **Design schemas** — tag-vs-field decisions, cardinality guidance, naming conventions, type stability.
- **Provision databases** — create / list / update (retention) / delete via CLI and HTTP API.
- **Manage tokens** — admin and scoped resource tokens (`db:<name>:read,write`), the safe rotation pattern (create-new → swap-secret → revoke-old, never the wrong order), listing via `system.tokens`.
- **Automate admin work in any of 6 client paths** — full lifecycle examples for Python, JavaScript/TypeScript, Go, Java, C#, and raw HTTP, each verified end-to-end against a live Enterprise instance.
- **Troubleshoot when things break** — symptom-keyed router for auth failures, silent-auto-create misroutes, write/query failures, admin failures, and plugin-runtime issues. Includes a redaction rule that never echoes a customer-pasted token, even partially.
- **Run a diagnostic toolkit** — Python script that produces a one-page health report (ping, flavor detection, list-DBs, write+query smoke against a throwaway DB) — the right thing to paste into Claude when something feels off.
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

In Claude Code, add this repo as a plugin marketplace and install the plugin:

```
/plugin marketplace add influxdata/claude-skill-for-influxdb3
/plugin install claude-influxdb3@influxdata
```

Verify with `/plugin` and check that `claude-influxdb3` appears as installed and enabled.

To update later:

```
/plugin marketplace update influxdata
/plugin update claude-influxdb3@influxdata
```

If you don't have InfluxDB 3 running yet, just ask Claude — the skill will walk you through it.

### Develop locally

If you're contributing to the plugin and want to install your working copy instead of the published version:

```bash
git clone https://github.com/influxdata/claude-skill-for-influxdb3.git ~/Projects/claude-influxdb3
```

If you already have the published marketplace registered, remove it first so the local one can take its place (the marketplace name `influxdata` would otherwise collide):

```
/plugin uninstall claude-influxdb3@influxdata
/plugin marketplace remove influxdata
```

Then point the marketplace at your local clone and install:

```
/plugin marketplace add ~/Projects/claude-influxdb3
/plugin install claude-influxdb3@influxdata
```

After editing files, refresh:

```
/plugin marketplace update influxdata
/plugin update claude-influxdb3@influxdata
```

## Use it

In any project that uses InfluxDB 3, write code as normal. The skill triggers when Claude sees imports of any official InfluxDB 3 client, references to line protocol, `INFLUXDB_*` env vars, admin keywords (`influxdb3 create token`, `/api/v3/configure/database`, etc.), or troubleshooting language ("getting a 401", "writes succeed but data isn't there", etc.).

If you want to test it cleanly:

> "I'm starting a new Python project that talks to InfluxDB 3 Core. Help me set up the connection and write 10 sample points."

## What it does NOT cover yet

When asked about any of the below, the skill defers to the official docs rather than guessing:

- **Performance tuning** — slow queries, cardinality remediation, batch-size optimization. Planned for v0.5.0.
- **v1/v2 → v3 migration helper** — v0.6.0.
- **App-pattern templates** — IoT pipelines, dashboards, alerts/downsampling. v0.7.0.
- **Cluster placement & multi-node patterns for plugins** — v0.2.1.
- **Air-gapped setup + Cloud admin verification** — v0.3.1.

## Verifying the skill is fresh

Each `SKILL.md`'s frontmatter includes `last_verified` and `verified_against` (per-client versions). If those dates are stale, the skill might be drifting from current client APIs — open an issue.

## Contributing

To make a change:

1. Skim the design specs under [`docs/superpowers/specs/`](docs/superpowers/) (one per version) to understand prior scope decisions.
2. Edit the relevant `SKILL.md`, `references/`, or `examples/` file.
3. Run the smoke tests in [`evals/smoke-prompts.md`](evals/smoke-prompts.md).
4. Run the formal eval suite (`evals/prompts.jsonl`). Adversarial cases must be 100%.
5. Open a PR.

Reviewer-onboarding details, including the four-area review split for the current MVP review pass, are in [`TESTING.md`](TESTING.md).

## License

MIT — see [`LICENSE`](LICENSE).
