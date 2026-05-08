# Scheduled plugin — hello-world

`process_scheduled_call_hello.py` is a minimal `process_scheduled_call` plugin. Every 30 seconds it counts how many `sensors_demo` rows were written in the last minute and writes a `scheduled_heartbeat` measurement with that count.

`LineBuilder` is provided as a runtime global; the plugin does not `import` it.

## Wire it up

```bash
# Assumes INFLUXDB_HOST, INFLUXDB_TOKEN (admin), INFLUXDB_DATABASE are set.
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "every:30s" \
  --path "$(pwd)/process_scheduled_call_hello.py" \
  --upload \
  scheduled_hello
```

## Wait for it to fire

The trigger fires automatically on the cadence — no external action needed. Wait at least 35 seconds, then:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='scheduled_hello' ORDER BY event_time DESC LIMIT 5"
```

Expected: rows with `log_level=INFO` and `log_text` lines for `starting execution of scheduled plugin.`, `heartbeat at 2026-...: N sensor rows in last minute`, and `finished execution in N ms`.

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM scheduled_heartbeat ORDER BY time DESC LIMIT 5"
```

Expected: rows with `source=scheduled_hello` and a `recent_count` integer.

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --force \
  scheduled_hello
```
