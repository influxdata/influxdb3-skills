# Example: TOML-Config Scheduled Plugin

A scheduled plugin with explicitly parsed TOML configuration.
The engine passes trigger arguments as strings; it does not load `config_file_path` into typed arguments on the tested 3.12.1 runtime.
Deployment encodes the TOML file into a single argument, and the plugin decodes it with `base64` and parses it with `tomllib`.

## What it does

On every tick of the scheduled trigger, the plugin logs a single line at info-level showing:

- the `threshold` (an `int`, with its type proven via `type().__name__`)
- the `label` (a `str`)
- the nested `severity_levels.warn` and `severity_levels.alert` thresholds parsed into a Python `dict`

No queries or writes are needed to demonstrate parsing and type preservation.

## Install and run

Keep the TOML file on the deployment machine.
The Python plugin does not read server files or depend on an implicit configuration loader.

### Stage the files

Copy the Python file into `PLUGIN_DIR` on the server.
For a Docker deployment, from this example directory:

```bash
docker cp example_toml_config.py <container-name>:/plugins/example_toml_config.py
```

To upload over HTTP instead, see `references/installing.md`.
The TOML file is sent as an argument below, not uploaded separately.

### Create the trigger

From this example directory, encode the configuration using Python 3 on the deployment machine.
Unpadded URL-safe base64 avoids commas and padding delimiters in the CLI argument.

```bash
CONFIG_TOML_B64=$(python3 -c 'import base64,pathlib; print(base64.urlsafe_b64encode(pathlib.Path("example_toml_config_scheduler.toml").read_bytes()).decode().rstrip("="))')

influxdb3 create trigger \
  --database mydb \
  --path example_toml_config.py \
  --trigger-spec "every:10s" \
  --trigger-arguments "config_toml_b64=$CONFIG_TOML_B64" \
  --token "$INFLUXDB_TOKEN" \
  toml_demo
```

## Verify it fired

Query `system.processing_engine_logs` after the first tick:

```bash
influxdb3 query \
  --database mydb \
  --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM system.processing_engine_logs WHERE trigger_name = 'toml_demo' ORDER BY event_time DESC LIMIT 5;"
```

You should see a row whose message looks like:

```
[demo-trigger] threshold=75 (int); warn_above=70, alert_above=90
```

The `(int)` shows the type returned by the plugin's TOML parser, not a type conversion by the engine.

## Things to notice

- The engine supplies `config_toml_b64` as a string. The plugin explicitly decodes and parses it.
- TOML integers and nested tables become Python integers and dictionaries after parsing.
- The plugin uses standard-library modules and performs no filesystem I/O.
- Configuration in this example contains thresholds and labels. Encoding is transport, not encryption.

## Cleanup

```bash
influxdb3 delete trigger \
  --database mydb \
  --token "$INFLUXDB_TOKEN" \
  --force \
  toml_demo
```
