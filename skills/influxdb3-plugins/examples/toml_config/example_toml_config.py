"""
Example: TOML-config scheduled plugin.

Activate with:
  influxdb3 create trigger \\
    --database mydb \\
    --path example_toml_config.py \\
    --trigger-spec "every:10s" \\
    --trigger-arguments "config_toml_b64=$CONFIG_TOML_B64" \\
    --token "$INFLUXDB_TOKEN" \\
    toml_demo

The deployment command encodes TOML into one trigger argument. The plugin
explicitly decodes and parses it; the engine does not load a config file.
"""

import base64
import tomllib


def process_scheduled_call(influxdb3_local, call_time, args=None):
    encoded = (args or {})["config_toml_b64"]
    raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
    config = tomllib.loads(raw.decode("utf-8"))
    threshold = config["threshold"]
    severity_levels = config["severity_levels"]
    label = config.get("label", "demo")

    influxdb3_local.info(
        f"[{label}] threshold={threshold} ({type(threshold).__name__}); "
        f"warn_above={severity_levels['warn']}, "
        f"alert_above={severity_levels['alert']}"
    )
