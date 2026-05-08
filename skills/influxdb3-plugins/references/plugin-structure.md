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

## Where to fetch more

`references/doc-urls.md` → "Plugin library" or the official repo on GitHub.
