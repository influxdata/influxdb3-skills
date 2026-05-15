# Trigger Lifecycle CLI Reference

The `influxdb3` CLI is the primary way to create, update, list (via system tables), enable/disable, and delete triggers. Every command also has an HTTP equivalent under `/api/v3/configure/processing_engine_trigger` for programmatic use.

All commands accept `--token <admin-token>` (or `INFLUXDB3_AUTH_TOKEN` env var) and `-H/--host <url>` (or `INFLUXDB3_HOST_URL` env var). Trigger creation, update, and deletion require an **admin token**.

## `influxdb3 create trigger`

Create a new trigger that connects a plugin to a database event. Positional argument is the trigger name; flags carry the configuration.

| Flag / arg | Required | Description |
|---|---|---|
| `<TRIGGER_NAME>` | yes (positional) | Name for this trigger. Must be unique within the database. |
| `-d`, `--database <name>` | yes | Target database. Must exist. |
| `--trigger-spec <spec>` | yes | When to fire: `table:<name>`, `all_tables`, `every:<duration>`, `cron:<expr>` (6-field with seconds), or `request:<path>`. |
| `--path <path>` | yes | Plugin filename (relative to `--plugin-dir`), absolute path with `--upload`, or `gh:` prefix for upstream plugins. |
| `--upload` | no | Upload the local file/dir to the server. Required when `--path` is absolute. |
| `--trigger-arguments k=v,k2=v2` | no | Comma-separated key=value pairs passed to the plugin as `args`. All values arrive as strings. **For typed values from a TOML file**, pass `config_file_path=<filename.toml>` — see `references/plugin-structure.md` → "Plugin configuration via TOML". |
| `--run-asynchronous` | no | Allow multiple instances of this trigger to run concurrently. Default is synchronous. |
| `--error-behavior <log\|retry\|disable>` | no | What happens when the plugin raises. Default `log`. |
| `--disabled` | no | Create the trigger in disabled state. |
| `--node-spec <spec>` | no | Cluster placement (default `all`). Multi-node territory; v0.2.1 will cover this. |
| `--token <admin-token>` | yes | Admin token (or `INFLUXDB3_AUTH_TOKEN` env). |

Example:

```bash
influxdb3 create trigger \
  --database my_database \
  --trigger-spec "table:sensors" \
  --path "/absolute/local/process_sensors.py" \
  --upload \
  --trigger-arguments threshold=90,unit=fahrenheit \
  --error-behavior log \
  --token "$INFLUXDB_TOKEN" \
  sensor_processor
```

> **Trigger spec quirk:** the CLI's own `--help` text mistakenly says HTTP triggers use `path:<PATH>`. The parser actually only accepts the prefixes `table:`, `all_tables:`, `cron:`, `every:`, or `request:`. **Use `request:<path>`** for HTTP plugins; `path:` is rejected.

## `influxdb3 update trigger`

Replace the plugin code for an existing trigger. Trigger configuration (spec, arguments, error-behavior) is preserved.

| Flag | Required | Description |
|---|---|---|
| `--database <name>` | yes | The trigger's database. |
| `--trigger-name <name>` | yes | Name of the trigger to update. |
| `--path <path>` | yes | New plugin code, same forms as `create trigger --path`. |
| `--token <admin-token>` | yes | Admin token. |

```bash
influxdb3 update trigger \
  --database my_database \
  --trigger-name sensor_processor \
  --path "/absolute/local/process_sensors.py" \
  --token "$INFLUXDB_TOKEN"
```

## Listing triggers

There is **no `influxdb3 show triggers`** subcommand. List triggers via SQL on the `_internal` database. The relevant system tables are flavor- and version-dependent; check available tables on your installed version:

```bash
influxdb3 query -d _internal --token "$INFLUXDB_TOKEN" "SHOW TABLES"
```

Look for tables matching `trigger`, `plugin`, or `engine`. Two known-good ones:

- `system.plugin_files` — installed plugin file metadata (`plugin_name`, `file_name`, `file_path`, `size_bytes`, `last_modified`).
- `system.processing_engine_logs` — runtime log output from every trigger (`event_time`, `trigger_name`, `log_level`, `log_text`). Queryable from any database context.

```bash
# List installed plugin files
influxdb3 query -d _internal --token "$INFLUXDB_TOKEN" \
  "SELECT plugin_name, file_name FROM system.plugin_files ORDER BY plugin_name"

# Recent log activity per trigger
influxdb3 query -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT trigger_name, count(*) AS n FROM system.processing_engine_logs WHERE event_time > now() - INTERVAL '1 hour' GROUP BY trigger_name"
```

For a CLI shortcut to plugin files (without the SQL): `influxdb3 show plugins`.

## `influxdb3 disable trigger` / `influxdb3 enable trigger`

Toggle a trigger off without deleting it (useful when debugging a misbehaving plugin). Same positional + flag pattern as `delete`:

```bash
influxdb3 disable trigger \
  --database my_database \
  --token "$INFLUXDB_TOKEN" \
  sensor_processor

influxdb3 enable trigger \
  --database my_database \
  --token "$INFLUXDB_TOKEN" \
  sensor_processor
```

## `influxdb3 delete trigger`

Permanently delete a trigger. Positional argument is the trigger name; `--force` skips the interactive confirmation prompt (required for scripted use).

```bash
influxdb3 delete trigger \
  --database my_database \
  --token "$INFLUXDB_TOKEN" \
  --force \
  sensor_processor
```

> **Don't pass `--trigger-name`** — that flag doesn't exist on `delete trigger`. Use the positional argument instead.

This does not delete the plugin file from `--plugin-dir`. To remove the file, use the HTTP plugin-files API or remove it server-side.

## HTTP API equivalents

| Action | Method + endpoint |
|---|---|
| Create trigger | `POST /api/v3/configure/processing_engine_trigger` |
| Upload plugin file | `PUT /api/v3/plugins/files?path=<relative>` |
| Install Python package | `POST /api/v3/configure/plugin_environment/install_packages` |
| Custom HTTP-trigger endpoint | `GET` or `POST /api/v3/engine/<request_path>` |

All admin-required operations need `Authorization: Bearer <admin-token>`. See `references/installing.md` for full request shapes.

## Where to fetch more

`references/doc-urls.md` → CLI reference for `influxdb3 create trigger` and the HTTP API reference.
