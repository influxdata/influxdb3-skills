# claude-influxdb3

A Claude Code skill that teaches Claude to write correct InfluxDB 3 code — connect, write, query, and design schemas — across **Core, Enterprise, Cloud Serverless, and Cloud Dedicated**, in **Python, JavaScript/TypeScript, Go, Java, C#**, or **raw HTTP**.

Stands alone — no MCP server required.

## What it does

When this skill is loaded, Claude knows how to:

- **Connect & authenticate** — env-var driven, never inlines tokens, gitignore enforcement.
- **Write data** — line protocol, batching rules, retriable vs. non-retriable error handling.
- **Query data** — SQL by default, parameterized user input, sensible pagination.
- **Design schemas** — tag-vs-field decisions, cardinality guidance, naming conventions.

It also auto-detects which InfluxDB 3 flavor you're targeting via the `/ping` endpoint, with a polite fallback to asking.

### What the `influxdb3-plugins` skill adds (v0.2.0)

When this skill is loaded, Claude knows how to:

- **Develop plugins** — the `influxdb3_local` runtime API, `LineBuilder`, the `Cache`, and the three entry-point signatures (`process_writes`, `process_scheduled_call`, `process_request`). Note that `table_batches` items are dicts (use `batch["table_name"]` / `batch["rows"]`).
- **Install plugins** — the `--upload` flag, `PUT /api/v3/plugins/files`, the `gh:` prefix for the official plugin repo, custom plugin repos via `--plugin-repo`.
- **Test plugins** — `influxdb3 test wal_plugin` and `influxdb3 test schedule_plugin` for offline simulation (HTTP plugins have no offline test command — they're tested via real triggers), plus the live-trigger iteration loop using `system.processing_engine_logs` (columns: `event_time`, `trigger_name`, `log_level`, `log_text`) and `influxdb3 update trigger`.
- **Manage plugin dependencies** — `influxdb3 install package` against the embedded venv (NOT system Python).
- **Maintain state across runs** — the trigger-local and global cache namespaces with TTLs.

Single-node only in v0.2.0; cluster patterns are v0.2.1.

### What v0.3.0 adds to the `influxdb3` skill

When this skill is loaded, Claude knows how to:

- **Provision databases** — `create database`, `show databases`, `update database` (retention period), `delete database` via CLI and HTTP API.
- **Manage tokens** — admin tokens, scoped resource tokens with `db:<name>:read,write` permission strings, listing via `system.tokens`, deletion.
- **Rotate tokens safely** — the create-new → swap-secret → revoke-old pattern, with explicit guidance against the wrong order.
- **Automate admin work in any of the 6 client paths** — Python, JavaScript/TypeScript, Go, Java, C#, raw HTTP. Each example exercises a complete 10-step lifecycle (list → create → use → rotate → cleanup → orphan check) and is verified end-to-end against the live Enterprise instance during build.

Cloud Serverless and Cloud Dedicated content ships as reference shape; runtime verification is queued for v0.3.1 (alongside air-gapped setup).

### What v0.4.0 adds

When the troubleshooting skills are loaded, Claude knows how to:

- **Diagnose by symptom** — symptom-keyed router that maps observable errors to topic sections (Auth failures, Write failures, Silent auto-create misroute, Query failures, Admin failures, Plugin runtime).
- **Redact tokens automatically** — when a customer pastes an error log containing a real-looking token, the skill acknowledges the leak, recommends rotation, and never echoes the literal token.
- **Walk a diagnostic flow** — symptom → check this in order → if X then Y else Z → fix.
- **Reference the quirks catalogue** — 12 entries cataloguing the non-obvious behaviors customers will hit (HEAD-on-/ping=404, silent auto-create, table_batches-as-dicts, JSON-string permissions, etc.).
- **Run the diagnostic toolkit** — a Python script that does a one-page health check (ping, flavor detection, list-DBs, write+query smoke against a throwaway DB).
- **Recognize the broken patterns** — five broken→fix demo pairs covering silent auto-create, admin-token-at-data-plane, table_batches attribute access, system.tokens permissions parsing, and HEAD-on-/ping.

Performance questions defer to v0.5.0; cluster placement defers to v0.2.1.

### What v0.4.1 adds

A patch release closing the user-onboarding gap: a user who installed the plugin but doesn't have InfluxDB 3 running yet can now ask Claude to help them get a Core or Enterprise instance up. New `references/installing.md` covers the official install script and Docker for both flavors, the bootstrap operator-token flow, and Enterprise license activation. Cloud Serverless and Cloud Dedicated stay out of scope — those are managed services, signup is a manual step the user does themselves.

## Status

**v0.4.1** — local distribution only. Two skills shipping in one plugin:

- **`influxdb3`** (v0.4.1) — connect, write, query, schema design, database & token management, troubleshooting & debugging, **plus install coverage** for Core and Enterprise (script + Docker). CLI + HTTP API across all four InfluxDB 3 flavors and 6 client paths.
- **`influxdb3-plugins`** (v0.4.1) — develop, install, test InfluxDB 3 Processing Engine plugins, plus plugin-runtime troubleshooting. Single-node; all three trigger types.

Future versions: distributed cluster patterns (v0.2.1), air-gapped + Cloud-instance verification (v0.3.1), performance tuning (v0.5.0), v1/v2→v3 migration (v0.6.0), common app patterns (v0.7.0). See [`CHANGELOG.md`](CHANGELOG.md).

## Install (local dev / preview)

```bash
git clone <this repo> ~/Projects/claude-influxdb3
mkdir -p ~/.claude/plugins
ln -s ~/Projects/claude-influxdb3 ~/.claude/plugins/claude-influxdb3
```

Restart Claude Code, then in a fresh session:

```
/plugin list
```

Expected: `claude-influxdb3 0.4.1`.

## Use it

In any project that uses InfluxDB 3, just write code as normal. The skill triggers when Claude sees imports of any official InfluxDB 3 client, references to line protocol, or `INFLUXDB_*` env vars.

If you want to test it cleanly:

> "I'm starting a new Python project that talks to InfluxDB 3 Core. Help me set up the connection and write 10 sample points."

## What it does NOT cover (yet)

Database & token management shipped in v0.3.0. Troubleshooting & debugging shipped in v0.4.0. Still to come:

- Performance tuning (slow queries, cardinality remediation) — v0.5.0
- v1/v2 → v3 migration helper — v0.6.0
- App-pattern templates (IoT pipelines, dashboards, alerts/downsampling) — v0.7.0
- Cluster placement & multi-node patterns — v0.2.1
- Air-gapped setup & Cloud-instance verification — v0.3.1

These are planned for upcoming versions.

## Verifying the skill is fresh

`SKILL.md`'s frontmatter includes `last_verified` and `verified_against` (per-client versions). If those dates are stale, the skill might be drifting from the current client APIs — open an issue.

## Contributing

This skill ships as a normal git repo. To make a change:

1. Read [`docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md`](docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md).
2. Edit the relevant `SKILL.md`, `references/`, or `examples/` file.
3. Run the smoke tests (see [`evals/README.md`](evals/README.md)).
4. Run the formal eval suite. Adversarial cases must be 100%.
5. Open a PR.

## License

MIT — see [`LICENSE`](LICENSE).
