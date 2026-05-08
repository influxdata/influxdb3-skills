"""Hello-world WAL plugin for InfluxDB 3 Processing Engine.

Trigger spec: table:sensors_demo (or all_tables for any table)

Logs the row count per table, then writes a derived `processed_summary` row
summarizing each batch. Demonstrates:
- the process_writes entry-point signature
- iterating TableBatches and rows
- LineBuilder usage with tags + int64 field (LineBuilder is a runtime-injected
  global — no import required)
- influxdb3_local.write(...)
"""


def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        n = len(batch.rows)
        influxdb3_local.info(f"WAL hello: {n} rows from {batch.table_name}")

        line = (LineBuilder("processed_summary")
                .tag("source_table", batch.table_name)
                .int64_field("row_count", n))
        influxdb3_local.write(line)
