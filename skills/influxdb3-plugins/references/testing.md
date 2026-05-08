# Testing Plugins

The InfluxDB 3 CLI ships `influxdb3 test` subcommands that simulate plugin invocations without creating triggers. Use them to iterate fast on plugin code before going live.

## Offline test: `influxdb3 test <type>_plugin`

Two subcommands (HTTP request plugins are tested via real triggers):

| Subcommand | What it tests |
|---|---|
| `influxdb3 test wal_plugin` | Simulates a `process_writes` invocation given line-protocol input. |
| `influxdb3 test schedule_plugin` | Simulates a `process_scheduled_call` invocation. |

> **There is no `influxdb3 test request_plugin`.** HTTP plugins must be exercised by creating the real trigger (see below) and `curl`-ing the endpoint.

### `influxdb3 test wal_plugin`

```
influxdb3 test wal_plugin [OPTIONS] --database <DATABASE> <FILENAME>
```

The `<FILENAME>` is the plugin's filename **as it lives on the server** under `<plugin-dir>/<filename>` — the test command does NOT have `--upload`. The plugin file must already be in the server's plugin-dir (or uploaded via `PUT /api/v3/plugins/files`). For local development, deploy first via a real `influxdb3 create trigger ... --upload`, or use the HTTP API to upload the file alone.

Common flags:

| Flag | Purpose |
|---|---|
| `-d`, `--database <name>` | Required. Target database. |
| `--token <auth>` | Admin token (or via `INFLUXDB3_AUTH_TOKEN` env). |
| `--lp <input_lp>` | Synthetic line protocol fed to `process_writes`. |
| `--file <input_file>` | Alternative to `--lp` — read LP from a file already on the server at `<plugin-dir>/<name>_test/<input-file>`. |
| `--input-arguments <k=v,k2=v2>` | Passed to the plugin as `args`. |
| `--cache-name <name>` | Optional named cache to use during the test. |
| `-H`, `--host <url>` | Server URL (or via `INFLUXDB3_HOST_URL` env). |

Example:

```bash
influxdb3 test wal_plugin \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --lp 'sensor,host=server01,region=us-west temperature=72.4 1714400000000000000' \
  my_plugin.py
```

The command runs the plugin against the synthetic input and prints the plugin's logs and any line protocol it would have written. **No trigger is created and no real data is written** — that's the point.

### `influxdb3 test schedule_plugin`

Same structure: positional `<FILENAME>`, the plugin must already exist on the server. Use `--input-arguments` to pass `args`. Use `--help` against your installed version for the exact flag set:

```bash
influxdb3 test schedule_plugin --help
```

### Testing HTTP request plugins

There is no offline test command for HTTP plugins. The fastest workflow:

1. Create the real trigger with `--error-behavior log`.
2. `curl http://localhost:8181/api/v3/engine/<path>` to exercise it.
3. `SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='<name>' ORDER BY event_time DESC LIMIT 50` to see output.
4. `influxdb3 update trigger ... --path` to push code changes; trigger config is preserved.
5. Repeat steps 2–4.

## Live trigger iteration loop

Once `influxdb3 test` (or, for HTTP plugins, the live trigger) validates your plugin works, deploy or refine using `update trigger`:

```bash
# Initial create — uploads the file
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "table:sensors" \
  --path "/absolute/path/my_plugin.py" \
  --upload \
  --error-behavior log \
  my_trigger

# Iterate: edit the local plugin file, then push without re-creating the trigger
influxdb3 update trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-name my_trigger \
  --path "/absolute/path/my_plugin.py"
```

`update trigger` preserves the trigger spec, arguments, and error-behavior — only the plugin code is replaced.

## Reading plugin logs

The `system.processing_engine_logs` table holds plugin output for every trigger in the database.

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, trigger_name, log_level, log_text FROM system.processing_engine_logs ORDER BY event_time DESC LIMIT 50"
```

Columns (verified against InfluxDB 3 Enterprise 3.8.4):

| Column | Type | Purpose |
|---|---|---|
| `event_time` | timestamp | When the log line was emitted. |
| `trigger_name` | string | Name of the trigger that produced the log. |
| `log_level` | string | `INFO` / `WARN` / `ERROR` (uppercase). |
| `log_text` | string | The space-joined args passed to `info`/`warn`/`error`. The runtime also emits framing lines like `starting execution of wal plugin.` and `finished execution in N ms`. |

Common queries:

```sql
-- Recent output from one trigger
SELECT event_time, log_level, log_text FROM system.processing_engine_logs
WHERE trigger_name = 'my_trigger'
ORDER BY event_time DESC LIMIT 50;

-- Errors in the last hour across all triggers
SELECT trigger_name, event_time, log_text FROM system.processing_engine_logs
WHERE log_level = 'ERROR' AND event_time > now() - INTERVAL '1 hour'
ORDER BY event_time DESC;
```

## Error-behavior flags

Set on `influxdb3 create trigger` (or `trigger_settings.error_behavior` via the HTTP API):

| Flag | Effect |
|---|---|
| `--error-behavior log` *(default)* | Errors are logged to `system.processing_engine_logs` and stdout; the trigger keeps running. **Pick this for development.** |
| `--error-behavior retry` | The plugin is re-invoked on error. Useful for transient external dependencies (a flaky API, a brief network blip). |
| `--error-behavior disable` | The trigger auto-disables on the first error. Pick this for "fail loud" critical paths where silent log failures are unacceptable. |

## Inspecting cache state

The `Cache` is in-memory only and not directly queryable from outside the plugin. Two patterns to inspect it:

### Pattern A: a temporary HTTP plugin that reads the cache

Create a one-off `process_request` plugin that returns `cache.get(key)` for keys you specify in the query string:

```python
def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):
    key = query_parameters.get("key", "")
    use_global = query_parameters.get("global") == "true"
    val = influxdb3_local.cache.get(key, default=None, use_global=use_global)
    return {"key": key, "value": val, "global": use_global}
```

Wire it up at `request:cache_inspect`, then `curl "http://localhost:8181/api/v3/engine/cache_inspect?key=counter"` to read.

### Pattern B: log cache reads from the plugin under test

In the plugin you're developing, add `influxdb3_local.info(f"cache[counter] = {value}")` after each `cache.get`. The values show up in `system.processing_engine_logs`.

## Where to fetch more

`references/doc-urls.md` → CLI reference for `influxdb3 test`.
