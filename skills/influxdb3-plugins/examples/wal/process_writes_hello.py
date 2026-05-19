"""Hello-world WAL plugin for InfluxDB 3 Processing Engine.

Trigger spec: table:sensors_demo (or all_tables for any table)

Logs the row count per table, then writes a derived `processed_summary` row
summarizing each batch. Demonstrates:
- the process_writes entry-point signature
- iterating table_batches: each item is a dict with "table_name" and "rows" keys
- LineBuilder usage with tags + int64 field (LineBuilder is a runtime-injected
  global — no import required)
- influxdb3_local.write_sync(line, no_sync=True) for writing the derived row
  back. write_sync is the preferred API; write(line) is legacy. no_sync=True
  returns as soon as the row is buffered (high-throughput); flip to no_sync=False
  if you need to wait for WAL sync.
"""


def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        # table_batches items are dicts with "table_name" and "rows" keys.
        table_name = batch["table_name"]
        rows = batch["rows"]
        n = len(rows)
        influxdb3_local.info(f"WAL hello: {n} rows from {table_name}")

        line = (LineBuilder("processed_summary")
                .tag("source_table", table_name)
                .int64_field("row_count", n))
        influxdb3_local.write_sync(line, no_sync=True)
