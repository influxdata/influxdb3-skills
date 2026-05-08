---
name: influxdb3-plugins
description: |
  Use when the developer is writing, installing, testing, troubleshooting,
  or debugging an InfluxDB 3 Processing Engine plugin (Python code that runs
  inside InfluxDB 3 Core or Enterprise). Triggers on the runtime API surface
  (influxdb3_local, LineBuilder, TableBatch, Cache), the three plugin entry
  points (process_writes, process_scheduled_call, process_request), the
  influxdb3 trigger CLI (influxdb3 create trigger, influxdb3 test wal_plugin,
  influxdb3 install package, --trigger-spec, --plugin-dir, --upload, gh:
  prefix), the trigger spec syntax (table:, all_tables, every:, cron:,
  request:), the /api/v3/configure/processing_engine_trigger and
  /api/v3/plugins/files HTTP endpoints, and plugin troubleshooting
  symptoms (trigger doesn't fire, plugin errors in
  system.processing_engine_logs, ImportError on dependencies,
  table_batches AttributeError, cache lifecycle gotchas). Distinct from the
  influxdb3 skill, which covers connecting to and querying InfluxDB 3 from
  external apps — this skill is for code that runs INSIDE InfluxDB.
version: 0.4.0
last_verified: "2026-05-08"
verified_against:
  influxdb3_core: "3.8"
  influxdb3_enterprise: "3.8"
  influxdb3_pe_runtime: "3.8"
---

# InfluxDB 3 Processing Engine Plugins Skill

## 1. What this skill is for

This skill teaches Claude to write, install, and test InfluxDB 3 Processing Engine plugins — Python code that runs **inside** InfluxDB 3 Core and Enterprise to react to writes, schedules, or HTTP requests.

It is for plugin code that lives in the server's plugin venv. For external application code that connects to InfluxDB 3 from outside (Python/JS/Go/Java/C#/HTTP), use the sibling `influxdb3` skill instead.

The Processing Engine is an embedded Python runtime; this skill does not require the InfluxDB MCP server.

## 2. Is the Processing Engine even enabled?

The engine activates when the server has `--plugin-dir` (or `INFLUXDB3_PLUGIN_DIR`) configured.

| Deployment | Default | Configuration |
|---|---|---|
| Docker images | Enabled | `INFLUXDB3_PLUGIN_DIR=/plugins` |
| DEB/RPM packages | Enabled | `plugin-dir="/var/lib/influxdb3/plugins"` |
| Binary / source | Disabled | Pass `--plugin-dir <path>` at server start |

If the developer is on binary/source and doesn't have the engine on, walk them through enabling it before any plugin work. Full setup: `references/installing.md`.

## 3. Pick the trigger type

| Goal | Trigger type | Entry-point | Read |
|---|---|---|---|
| Process data as it's written | WAL / data-write | `process_writes` | `references/trigger-types.md` + `examples/wal/` |
| Run on a schedule | Scheduled | `process_scheduled_call` | `references/trigger-types.md` + `examples/scheduled/` |
| Custom HTTP endpoint | HTTP request | `process_request` | `references/trigger-types.md` + `examples/request/` |

All three share the same runtime API. Differences are entry-point signature and trigger-spec syntax.

## 4. The runtime API

Every plugin gets `influxdb3_local` injected (no `import` needed). Five things to know:

- **Logging** — `info`, `warn`, `error`. Output goes to `system.processing_engine_logs`.
- **Querying** — `query(sql, args=None)` returns `list[dict[str, Any]]`. Time is nanosecond int.
- **Writing** — `write(LineBuilder)` queues line protocol; `write_to_db(name, line)` writes to a different DB.
- **State** — `cache.put/get/delete` with optional TTL; trigger-local by default, `use_global=True` to share.
- **Line protocol** — `LineBuilder("measurement").tag(...).int64_field(...).build()`. Type-strict — once a field is float, can't switch to string.

`LineBuilder` is also a runtime-injected global — **do not `import` it**. Use it as a bare name.

For WAL plugins specifically, `table_batches` items are **plain dicts**, not class instances. Access via key: `batch["table_name"]`, `batch["rows"]`. NOT attributes.

Full surface: `references/runtime-api.md`.

## 5. Single-file vs multi-file plugins

- **Single-file** — one `.py` with the entry-point at module level. `--path` is the filename. Default for hello-worlds and < ~200 lines of logic.
- **Multi-file** — directory with `__init__.py` containing the entry-point. Use relative imports (`from .processors import ...`). `--path` is the directory.

Full guide: `references/plugin-structure.md`.

## 6. Install / deploy

Three paths:

1. **Local development** → `--upload` flag with absolute path. Server uploads the file/directory.
2. **Production** → place plugin in `--plugin-dir` via deploy tooling; trigger uses relative path.
3. **Use an upstream plugin** → `--path "gh:influxdata/system_metrics/system_metrics.py"`. Resolves against the official repo (or a custom one set with `--plugin-repo`).

Full reference + HTTP API equivalents + security: `references/installing.md`.

**Security:** plugin upload, update, and trigger creation all require an **admin token**. Path traversal (`..`, absolute paths) is blocked by the server. The v0.1.0 rule still applies — never inline `INFLUXDB_TOKEN` in generated commands or scripts.

## 7. Test before you trigger

Two layers:

- **Offline (WAL + scheduled only)** — `influxdb3 test wal_plugin` and `influxdb3 test schedule_plugin`. There is no offline test for HTTP request plugins; test those by creating a real trigger and `curl`-ing the endpoint.
- **Live** — `influxdb3 create trigger ... --error-behavior log`, cause it to fire, then `SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='<name>' ORDER BY event_time DESC LIMIT 50`. Iterate with `influxdb3 update trigger --path` (preserves spec/args).

Full reference + log queries + error-behavior modes + cache inspection: `references/testing.md`. CLI flag reference: `references/triggers-cli.md`.

## 8. Python dependencies

- Use `influxdb3 install package <pkg>` to install into the embedded venv at `<PLUGIN_DIR>/venv`.
- **Never** `python -m venv` against system Python — wrong interpreter, runtime errors guaranteed.

Full reference: `references/dependencies.md`.

## 9. State / Cache

For state across plugin executions, use `influxdb3_local.cache`:

- `put(key, value, ttl=None, use_global=False)`
- `get(key, default=None, use_global=False)`
- `delete(key, use_global=False)`

Trigger-local by default; pass `use_global=True` to share across plugins. Cleared on server restart — design for cache-cold case.

Patterns (counter, TTL'd API response, lookup table, last-seen timestamp): `references/state-and-cache.md`.

## 10. Plugin troubleshooting

When your plugin isn't behaving — trigger doesn't fire, errors in the logs, dependencies failing, cache not behaving as expected.

**Three rules:**
- **Read the logs first.** `system.processing_engine_logs` (columns: `event_time`, `trigger_name`, `log_level`, `log_text`) tells you what the plugin actually did. Most "doesn't fire" diagnoses become obvious once you see the log line saying it fired but errored.
- **Check the trigger spec.** `table:my_table` ≠ `all_tables`. `every:30s` ≠ `every:5m`. `request:foo` ≠ `request:bar`. A spec mismatch silently causes "trigger doesn't fire."
- **For dependencies, use `influxdb3 install package`** against the embedded venv — never `python -m venv` against system Python (`references/quirks.md` entry 9).

**Symptom → section:**

| Symptom | Read |
|---|---|
| Trigger created but never fires | `references/troubleshooting.md` → "Trigger doesn't fire" |
| Plugin logs show ImportError | `references/troubleshooting.md` → "Dependencies" + `references/quirks.md` entry 9 |
| `'dict' object has no attribute 'rows'` | `references/quirks.md` entry 3 (cross-link to main skill) |
| `Schema error: No field named plugin_name` (or similar) on `system.processing_engine_logs` | `references/quirks.md` entry 10 |
| Cache values disappeared / counter reset | `references/troubleshooting.md` → "Cache lifecycle gotchas" |
| Plugin runs but writes don't show up | back to main skill: `references/troubleshooting.md` → "Silent auto-create misroute" |

Full reference: `references/troubleshooting.md`.

## 11. What this skill does NOT cover (v0.4.0)

If the developer asks about any of these, defer politely:

- **Distributed cluster placement** (`--node-spec`, ingester vs query nodes, WAL fan-out, schedule-write-back patterns) → "v0.2.1 covers cluster patterns; not yet shipped."
- **Air-gapped / `--package-manager disabled`** → "v0.3.0+ covers air-gapped configurations; for now, the embedded venv expects internet access for `influxdb3 install package`."
- **Full Explorer-compatible plugin metadata schemas** → "v0.3.0+ covers the metadata-docstring schema for Explorer UI integration; for now, see `references/plugin-structure.md` → 'Plugin metadata docstring' for a pointer to the canonical schema."
- **TOML config files for plugins** → "v0.3.0+ covers TOML config patterns."

Sample deferral:

> "Plugin distributed-cluster placement is on the roadmap but not yet covered (it's the v0.2.1 scope). For now, the official docs at https://docs.influxdata.com/influxdb3/enterprise/plugins/ cover the cluster patterns; in this skill I can help you with single-node plugin work."

## When in doubt, fetch fresh docs

If a question lands outside what's baked in (a recent CLI flag, a less-common runtime method, a new endpoint), WebFetch from a curated URL in `references/doc-urls.md`. Do not invent URLs.

## Cross-reference: the other skill

Plugin code can `import` and use the `influxdb3-python` client to talk to OTHER InfluxDB instances; for that, the sibling `influxdb3` skill covers connect/auth/write/query patterns from external Python.
