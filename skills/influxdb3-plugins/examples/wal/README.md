# WAL plugin — hello-world

`process_writes_hello.py` is a minimal `process_writes` plugin. It fires when WAL flushes data to the watched table, logs the row count, and writes a `processed_summary` measurement with a `source_table` tag and `row_count` field.

`LineBuilder` is provided as a runtime global; the plugin does not `import` it.

## Wire it up

```bash
# Upload + create trigger (assumes INFLUXDB_HOST/INFLUXDB_TOKEN/INFLUXDB_DATABASE are set in your shell;
# token must be an admin token)
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "table:sensors_demo" \
  --path "$(pwd)/process_writes_hello.py" \
  --upload \
  wal_hello
```

## Cause it to fire

```bash
# Write a few rows to sensors_demo so the WAL flushes
NOW=$(date +%s)
curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "sensors_demo,host=server01 temp=72.4 $NOW"
```

WAL flushes default to ~1 second. Wait ~2 seconds, then check the logs:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT time, level, message FROM system.processing_engine_logs WHERE plugin_name='wal_hello' ORDER BY time DESC LIMIT 5"
```

Expected: a row with `level=info` and a message like `WAL hello: 1 rows from sensors_demo`.

Confirm the derived measurement exists:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM processed_summary ORDER BY time DESC LIMIT 5"
```

Expected: a row with `source_table=sensors_demo` and `row_count=1`.

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --force \
  wal_hello
```
