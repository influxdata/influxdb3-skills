"""
Example: TOML-config scheduled plugin.

Activate with:
  influxdb3 create trigger \\
    --database mydb \\
    --path example_toml_config.py \\
    --trigger-spec "every:10s" \\
    --trigger-arguments config_file_path=example_toml_config_scheduler.toml \\
    --token "$INFLUXDB_TOKEN" \\
    toml_demo

The engine reads the TOML alongside this file and merges its keys into args.
No tomllib import here — the engine handled the parsing before this function
was called.
"""


def process_scheduled_call(influxdb3_local, call_time, args=None):
    threshold = args["threshold"]              # int, not str — TOML preserved the type
    severity_levels = args["severity_levels"]  # dict from a [severity_levels] table
    label = args.get("label", "demo")

    influxdb3_local.info(
        f"[{label}] threshold={threshold} ({type(threshold).__name__}); "
        f"warn_above={severity_levels['warn']}, "
        f"alert_above={severity_levels['alert']}"
    )
