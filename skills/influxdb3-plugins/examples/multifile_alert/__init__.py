"""Multi-file alert plugin for InfluxDB 3 Processing Engine.

Trigger spec: table:sensors_demo

Watches the sensors_demo table and emits an `alert` measurement when a
configurable temperature threshold is crossed. Demonstrates:
- the multi-file plugin layout (directory with __init__.py)
- relative imports between sibling modules
- args parsing with sane defaults
- table_batches dict access (batch["table_name"], batch["rows"])
- LineBuilder as a runtime global (no import in __init__.py; supporting
  modules likewise rely on the runtime injection)
"""
from .config import AlertConfig
from .processors import emit_alerts


def process_writes(influxdb3_local, table_batches, args=None):
    cfg = AlertConfig.from_args(args)
    influxdb3_local.info(f"alert config: threshold={cfg.threshold} field={cfg.field} table={cfg.table}")

    for batch in table_batches:
        # batch is a dict; access via key, NOT attribute
        if batch["table_name"] != cfg.table:
            continue
        emit_alerts(influxdb3_local, batch, cfg)
