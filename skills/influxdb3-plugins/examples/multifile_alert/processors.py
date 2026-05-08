"""Threshold-checking and alert emission for the multifile_alert plugin.

Note: LineBuilder is a runtime-injected global; it is available without import
when the plugin runs inside the InfluxDB 3 Processing Engine.
"""


def emit_alerts(influxdb3_local, batch, cfg):
    """Walk batch['rows']; emit an alert measurement for each row that crosses cfg.threshold."""
    n_alerts = 0
    table_name = batch["table_name"]
    for row in batch["rows"]:
        value = row.get(cfg.field)
        if value is None:
            continue
        try:
            value_f = float(value)
        except (TypeError, ValueError):
            continue
        if value_f < cfg.threshold:
            continue

        host = row.get("host", "unknown")
        line = (LineBuilder("alert")
                .tag("source_table", table_name)
                .tag("host", str(host))
                .tag("field", cfg.field)
                .float64_field("value", value_f)
                .float64_field("threshold", cfg.threshold))
        influxdb3_local.write(line)
        n_alerts += 1

    if n_alerts:
        influxdb3_local.info(f"emitted {n_alerts} alert(s) from {table_name}")
