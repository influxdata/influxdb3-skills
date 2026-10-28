# Plugin Structure

A plugin is a Python module — either a single `.py` file or a directory with `__init__.py` — that defines one of the three entry-point functions (`process_writes`, `process_scheduled_call`, or `process_request`).

## Single-file plugin

The simplest shape. One `.py` file with the entry-point at module level.

```
plugins-dir/
└── my_plugin.py    # contains process_writes / process_scheduled_call / process_request
```

When creating a trigger, `--path` is the filename:

```bash
influxdb3 create trigger \
  --trigger-spec "every:1m" \
  --path "my_plugin.py" \
  --database my_database \
  my_trigger
```

When the file lives outside the configured `--plugin-dir`, add `--upload` and pass an absolute path; the file gets uploaded to the server.

```bash
influxdb3 create trigger \
  --trigger-spec "every:1m" \
  --path "/absolute/local/path/my_plugin.py" \
  --upload \
  --database my_database \
  my_trigger
```

## Multi-file plugin

A directory with an `__init__.py` containing the entry-point. Supporting modules live alongside.

```
plugins-dir/
└── my_alert/
    ├── __init__.py       # contains the entry-point function (process_writes / etc.)
    ├── processors.py     # supporting module
    └── config.py         # supporting module
```

`__init__.py` imports from siblings using relative imports:

```python
# my_alert/__init__.py
from .processors import process_data
from .config import get_settings

def process_writes(influxdb3_local, table_batches, args=None):
    settings = get_settings(args)
    for batch in table_batches:
        process_data(influxdb3_local, batch, settings)
```

When creating a trigger, `--path` is the directory name (when the plugin already lives in the configured plugin-dir) or the absolute directory path with `--upload` (when uploading from local).

```bash
# Already on server
influxdb3 create trigger \
  --trigger-spec "table:sensors" \
  --path "my_alert" \
  --database my_database \
  alert_trigger

# Upload from local
influxdb3 create trigger \
  --trigger-spec "table:sensors" \
  --path "/absolute/local/path/my_alert" \
  --upload \
  --database my_database \
  alert_trigger
```

## When to use which

- **Single-file** — under ~200 lines of plugin logic. Easier to upload and update; no relative-import setup. Default for hello-worlds and quick scripts.
- **Multi-file** — large plugins, plugins with reusable internal modules, or plugins that benefit from a clear separation between trigger-handler logic, processing logic, and config parsing.

## Plugin metadata docstring (informational)

The official plugin library uses a JSON metadata docstring header to declare the plugin's supported trigger types and configurable arguments — this is what the InfluxDB 3 Explorer UI reads to render plugin configuration forms.

The canonical schema is `REQUIRED_PLUGIN_METADATA.md` in https://github.com/influxdata/influxdb3_plugins.

Our hello-world examples in `examples/` do **not** ship full metadata docstrings — they're minimal by design. If a developer plans to share their plugin via the official library or via Explorer's UI, they should add the metadata docstring per the canonical schema before publishing.

## Plugin configuration via TOML

The tested Core and Enterprise 3.12.1 runtime passes trigger arguments as strings.
It does not automatically load a TOML file named by `config_file_path` or merge its contents into `args`.
A library plugin can implement its own configuration loader; that behavior belongs to that plugin, not the engine.

### File location

For the runnable example, keep TOML on the deployment machine and pass its unpadded URL-safe base64 encoding in a single trigger argument:

```bash
--trigger-arguments "config_toml_b64=$CONFIG_TOML_B64"
```

The plugin explicitly decodes the value and parses it with Python's standard-library `tomllib`.
It does not read server files.

### Naming convention (recommended)

The InfluxData house style for the official plugin library is:

```
<plugin_base>_config_<trigger_type>.toml
```

Examples (from `influxdata/influxdb3_plugins/influxdata/basic_transformation/`):

- `basic_transformation_config_scheduler.toml`
- `basic_transformation_config_data_writes.toml`

Different trigger types can use different configuration files on the deployment machine.
This naming convention does not imply engine-managed loading.

### Worked example

A scheduled plugin reading a threshold from TOML:

```python
import base64
import tomllib

def process_scheduled_call(influxdb3_local, call_time, args=None):
    encoded = (args or {})["config_toml_b64"]
    raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
    config = tomllib.loads(raw.decode("utf-8"))
    threshold = config["threshold"]
    label = config.get("label", "default")
    influxdb3_local.info(f"[{label}] threshold={threshold}")
```

```toml
# my_plugin_config_scheduler.toml
threshold = 75
label = "demo"
```

Encode the TOML on the deployment machine, then create the trigger:

```bash
CONFIG_TOML_B64=$(python3 -c 'import base64,pathlib; print(base64.urlsafe_b64encode(pathlib.Path("my_plugin_config_scheduler.toml").read_bytes()).decode().rstrip("="))')

influxdb3 create trigger \
  --database mydb \
  --path my_plugin.py \
  --trigger-spec "every:1m" \
  --trigger-arguments "config_toml_b64=$CONFIG_TOML_B64" \
  --token "$INFLUXDB_TOKEN" \
  my_plugin_trigger
```

Here `my_plugin.py` must already be in the server's plugin directory.
The TOML is sent as an argument; the engine does not resolve a companion file.
See `examples/toml_config/README.md` for the staging and verification steps.

### Parsing produces native types

The argument remains a string until the plugin parses it:

| Source | Result | Type |
|---|---|---|
| Parsed TOML: `threshold = 75` | `75` | `int` |
| Inline: `--trigger-arguments threshold=75` | `"75"` | `str` |

Python's TOML parser produces dictionaries, lists, and booleans from the corresponding TOML values.
Inline numeric arguments still require explicit conversion in plugin code.

### Runnable example (external)

See `skills/influxdb3-plugins/examples/toml_config/` for a runnable scheduled-trigger plugin with a matching TOML, install commands, and verification queries.

### When in doubt

For canonical real-world examples of TOML config in production InfluxData plugins, see the official repo's `influxdata/` directory: https://github.com/influxdata/influxdb3_plugins/tree/main/influxdata

## Where to fetch more

`references/doc-urls.md` → "Plugin library" or the official repo on GitHub.
