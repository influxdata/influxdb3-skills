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

The canonical schema lives at `~/Projects/influxdb3_plugins/REQUIRED_PLUGIN_METADATA.md` (or in the public repo at https://github.com/influxdata/influxdb3_plugins).

Our hello-world examples in `examples/` do **not** ship full metadata docstrings — they're minimal by design. If a customer plans to share their plugin via the official library or via Explorer's UI, they should add the metadata docstring per the canonical schema before publishing.

## Plugin configuration via TOML

InfluxDB 3 loads TOML config files for you. Pass `config_file_path=<filename>` as one of the `--trigger-arguments` when creating the trigger, and the engine reads the TOML and merges its keys into the `args` dict your entry-point function receives. **Do not import `tomllib` in your plugin** — the parsing happens before your code runs.

### File location

The TOML file must live under the directory your InfluxDB 3 host has configured as `PLUGIN_DIR` (the same directory holding your `.py` file). The value passed to `config_file_path` is resolved relative to `PLUGIN_DIR`:

```bash
--trigger-arguments config_file_path=my_plugin_config_scheduler.toml
```

Absolute paths and paths outside `PLUGIN_DIR` are not supported.

### Naming convention (recommended)

The InfluxData house style for the official plugin library is:

```
<plugin_base>_config_<trigger_type>.toml
```

Examples (from `influxdata/influxdb3_plugins/influxdata/basic_transformation/`):

- `basic_transformation_config_scheduler.toml`
- `basic_transformation_config_data_writes.toml`

Different file per trigger type because different entry points (`process_scheduled_call` vs `process_writes`) typically want different schemas. The engine doesn't enforce this naming — `config_file_path` accepts any filename — but following the convention makes plugins easier for downstream developers to recognize.

### Worked example

A scheduled plugin reading a threshold from TOML:

```python
# my_plugin.py
def process_scheduled_call(influxdb3_local, call_time, args=None):
    threshold = args["threshold"]        # int, not str
    label = args.get("label", "default")
    influxdb3_local.info(f"[{label}] threshold={threshold}")
```

```toml
# my_plugin_config_scheduler.toml
threshold = 75
label = "demo"
```

Create the trigger with:

```bash
influxdb3 create trigger \
  --database mydb \
  --path my_plugin.py \
  --trigger-spec "every:1m" \
  --trigger-arguments config_file_path=my_plugin_config_scheduler.toml \
  --token "$INFLUXDB_TOKEN" \
  my_plugin_trigger
```

Note `--path my_plugin.py` is the bare filename (no `--upload`) — for TOML-config plugins, both the `.py` and the `.toml` must already live in `PLUGIN_DIR` before you create the trigger, because `--upload` only transfers the single Python file. `--path` resolves the .py from `PLUGIN_DIR`; the engine separately resolves `config_file_path` from the same directory. See `examples/toml_config/README.md` for the file-staging steps.

### Native types are preserved

This is the practical reason to prefer TOML over inline `--trigger-arguments key=val`:

| Source | Value of `args["threshold"]` | Type |
|---|---|---|
| TOML: `threshold = 75` | `75` | `int` |
| Inline: `--trigger-arguments threshold=75` | `"75"` | `str` |

TOML tables become Python `dict`s, arrays become `list`s, booleans become `bool`. No casting required in the plugin — `int(args["threshold"])` is unnecessary (and counterproductive) when the value comes from TOML.

### Runnable example (external)

See `skills/influxdb3-plugins/examples/toml_config/` for a runnable scheduled-trigger plugin with a matching TOML, install commands, and verification queries.

### When in doubt

For canonical real-world examples of TOML config in production InfluxData plugins, see the official repo's `influxdata/` directory: https://docs.influxdata.com/influxdb3/enterprise/plugins/library/

## Where to fetch more

`references/doc-urls.md` → "Plugin library" or the official repo on GitHub.
