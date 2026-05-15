# Example: TOML-Config Scheduled Plugin

A minimal scheduled-trigger plugin that reads its configuration from a TOML file. Demonstrates the InfluxDB 3 Processing Engine's built-in TOML loading — the plugin does **not** import `tomllib`; the engine handles parsing before `process_scheduled_call` is invoked.

## What it does

On every tick of the scheduled trigger, the plugin logs a single line at info-level showing:

- the `threshold` (an `int`, with its type proven via `type().__name__`)
- the `label` (a `str`)
- the nested `severity_levels.warn` and `severity_levels.alert` thresholds (from a TOML `[severity_levels]` table that arrives as a Python `dict`)

No queries, no writes — the goal is purely to make TOML-to-args delivery observable.

## Install and run

Both files must live under your `PLUGIN_DIR` on the InfluxDB 3 host. With `example_toml_config.py` and `example_toml_config_scheduler.toml` in place:

```bash
influxdb3 create trigger \
  --database mydb \
  --plugin-filename example_toml_config.py \
  --trigger-spec "every:10s" \
  --trigger-arguments config_file_path=example_toml_config_scheduler.toml \
  --token "$INFLUXDB_TOKEN" \
  toml_demo
```

## Verify it fired

Query `system.processing_engine_logs` after the first tick:

```sql
SELECT * FROM system.processing_engine_logs
WHERE trigger_name = 'toml_demo'
ORDER BY event_time DESC
LIMIT 5;
```

You should see a row whose message looks like:

```
[demo-trigger] threshold=75 (int); warn_above=70, alert_above=90
```

The `(int)` is the receipt that the engine preserved the TOML type rather than stringifying it.

## Things to notice

- **The plugin never imports `tomllib`.** The engine parses the TOML before invoking your entry-point. Keep your plugin code dependency-free of any TOML library.
- **Native types come through.** `threshold` is an `int`, `severity_levels` is a `dict`, not strings. This is the practical reason to prefer TOML over inline `--trigger-arguments key=val` (which always arrive as strings).
- **`config_file_path` is `PLUGIN_DIR`-relative.** Pass just the filename, not an absolute path, unless your operator wants to opt into a non-standard layout.
- **House naming convention:** `<plugin_base>_config_<trigger_type>.toml`. The engine doesn't enforce it — `config_file_path` accepts any filename — but matching the InfluxData convention makes plugins easier to recognize and lets you ship separate TOMLs for a single plugin's multiple trigger types (e.g., scheduled + data-writes).
