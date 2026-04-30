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

## Status

**v0.1.0** — local distribution only. Future versions will cover database/token management, troubleshooting, performance tuning, v1/v2 → v3 migration, and common app patterns (see [`CHANGELOG.md`](CHANGELOG.md) and the [design spec](docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md)).

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

Expected: `claude-influxdb3 0.1.0`.

## Use it

In any project that uses InfluxDB 3, just write code as normal. The skill triggers when Claude sees imports of any official InfluxDB 3 client, references to line protocol, or `INFLUXDB_*` env vars.

If you want to test it cleanly:

> "I'm starting a new Python project that talks to InfluxDB 3 Core. Help me set up the connection and write 10 sample points."

## What it does NOT cover (yet)

- Database & token management (create/list/delete DBs)
- Troubleshooting & debugging
- Performance tuning
- v1/v2 → v3 migration helper
- App-pattern templates (IoT pipelines, dashboards, alerts/downsampling)

These are planned for v1.1+.

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
