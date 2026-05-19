"""Hello-world scheduled plugin for InfluxDB 3 Processing Engine.

Trigger spec: every:30s

Every 30 seconds, queries the count of rows written to sensors_demo in
the last minute and writes the count as a heartbeat measurement.
Demonstrates:
- the process_scheduled_call entry-point signature
- influxdb3_local.query() usage
- LineBuilder usage with int64 field (LineBuilder is a runtime-injected
  global — no import required)
- writing back via influxdb3_local.write_sync(line, no_sync=True) — the preferred
  API. write(line) is legacy. no_sync is required (no default).
"""


def process_scheduled_call(influxdb3_local, call_time, args=None):
    rows = influxdb3_local.query(
        "SELECT count(*) AS n FROM sensors_demo WHERE time > now() - INTERVAL '1 minute'"
    )
    n = int(rows[0]["n"]) if rows else 0
    influxdb3_local.info(f"heartbeat at {call_time.isoformat()}: {n} sensor rows in last minute")

    line = (LineBuilder("scheduled_heartbeat")
            .tag("source", "scheduled_hello")
            .int64_field("recent_count", n))
    influxdb3_local.write_sync(line, no_sync=True)
