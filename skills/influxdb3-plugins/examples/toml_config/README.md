# Example: TOML-Config Scheduled Plugin

A scheduled plugin that reads its configuration from a TOML file in the plugin directory.
The engine passes trigger arguments as strings and doesn't load `config_file_path` itself.
The plugin reads the file named by `config_file_path` from `PLUGIN_DIR` and parses it with `tomllib`.
This follows the [plugin library's TOML convention](https://docs.influxdata.com/influxdb3/core/plugins/library/#using-toml-configuration-files).

## What it does

On every tick of the scheduled trigger, the plugin logs a single line at info-level showing:

- the `threshold` (an `int`, with its type proven via `type().__name__`)
- the `label` (a `str`)
- the nested `severity_levels.warn` and `severity_levels.alert` thresholds parsed into a Python `dict`

No queries or writes are needed to demonstrate parsing and type preservation.

## Install and run

### Start the server with `PLUGIN_DIR`

Set the `PLUGIN_DIR` environment variable to the same directory as `--plugin-dir`.
`--plugin-dir` tells the server where plugin files are, and `PLUGIN_DIR` tells the plugin where its configuration file is.
For Docker, add `-e PLUGIN_DIR=/plugins` to the `docker run` command.

### Stage the files

Copy the plugin and its TOML file into the plugin directory.
For a Docker deployment, from this example directory:

```bash
docker cp example_toml_config.py <container-name>:/plugins/example_toml_config.py
docker cp example_toml_config_scheduler.toml <container-name>:/plugins/example_toml_config_scheduler.toml
```

To upload the plugin over HTTP instead, see `references/installing.md`.

### Create the trigger

```bash
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --path example_toml_config.py \
  --trigger-spec "every:10s" \
  --trigger-arguments "config_file_path=example_toml_config_scheduler.toml" \
  --token "$INFLUXDB_ADMIN_TOKEN" \
  toml_demo
```

## Verify it fired

Query `system.processing_engine_logs` after the first tick:

```bash
influxdb3 query \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM system.processing_engine_logs WHERE trigger_name = 'toml_demo' ORDER BY event_time DESC LIMIT 5;"
```

You should see a row whose message looks like:

```
[demo-trigger] threshold=75 (int); warn_above=70, alert_above=90
```

The `(int)` shows the type returned by the plugin's TOML parser, not a type conversion by the engine.
If `PLUGIN_DIR` isn't set, the log shows an `ERROR` row instead.

## Things to notice

- The engine supplies `config_file_path` as a string. The plugin reads and parses the file.
- TOML integers and nested tables become Python integers and dictionaries after parsing.
- The plugin resolves the path inside `PLUGIN_DIR` and rejects absolute paths, `..`, and symlinks that point outside it.
- Keep secrets out of the TOML file and the trigger arguments. Trigger arguments are readable in `system.processing_engine_trigger_arguments`.

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_ADMIN_TOKEN" \
  --force \
  toml_demo
```
