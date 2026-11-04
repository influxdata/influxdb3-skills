"""
Example: TOML-config scheduled plugin.

Start the server with the PLUGIN_DIR environment variable set to the same
directory as --plugin-dir, and copy example_toml_config_scheduler.toml into it.
Then activate with:
  influxdb3 create trigger \\
    --database "$INFLUXDB_DATABASE" \\
    --path example_toml_config.py \\
    --trigger-spec "every:10s" \\
    --trigger-arguments "config_file_path=example_toml_config_scheduler.toml" \\
    --token "$INFLUXDB_ADMIN_TOKEN" \\
    toml_demo

The engine passes config_file_path as a string. The plugin reads the file from
PLUGIN_DIR and parses it; the engine doesn't load or merge it.
"""

import os
import tomllib


def load_config(influxdb3_local, args):
    plugin_dir = os.environ.get("PLUGIN_DIR")
    name = (args or {}).get("config_file_path")
    if not plugin_dir or not name:
        influxdb3_local.error("set PLUGIN_DIR on the server and pass config_file_path")
        return None
    base = os.path.realpath(plugin_dir)
    path = os.path.realpath(os.path.join(base, name))
    # Keep the config inside PLUGIN_DIR: reject absolute paths, "..", and
    # symlinks that resolve outside it.
    if os.path.commonpath([base, path]) != base:
        influxdb3_local.error("config_file_path must stay inside PLUGIN_DIR")
        return None
    with open(path, "rb") as f:
        return tomllib.load(f)


def process_scheduled_call(influxdb3_local, call_time, args=None):
    config = load_config(influxdb3_local, args)
    if config is None:
        return
    threshold = config["threshold"]
    severity_levels = config["severity_levels"]
    label = config.get("label", "demo")

    influxdb3_local.info(
        f"[{label}] threshold={threshold} ({type(threshold).__name__}); "
        f"warn_above={severity_levels['warn']}, "
        f"alert_above={severity_levels['alert']}"
    )
