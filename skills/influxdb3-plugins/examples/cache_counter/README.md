# Cache counter — state-management example

`counter.py` is a scheduled plugin that increments a trigger-local counter on each fire and writes it as a `plugin_counter` measurement. Demonstrates the `Cache` API: `get(default=...)`, `put`, `put` with TTL, and `delete`.

## Wire it up

```bash
# Assumes INFLUXDB_HOST, INFLUXDB_TOKEN (admin), INFLUXDB_DATABASE are set.
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "every:30s" \
  --path "$(pwd)/counter.py" \
  --upload \
  cache_counter
```

## Wait for it to fire

The trigger fires automatically every 30s. Wait at least 70 seconds (so it fires twice), then:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='cache_counter' ORDER BY event_time DESC LIMIT 8"
```

Expected: messages like `counter=1 last_seen=2026-05-08T... temp_delete=ok`, then `counter=2 ...`, then `counter=3 ...` — proving the counter persists across invocations.

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM plugin_counter ORDER BY time DESC LIMIT 5"
```

Expected: `count` increasing on each row.

> Note: the counter resets if the InfluxDB server restarts (the cache is in-memory).

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --force \
  cache_counter
```
