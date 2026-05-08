# Multi-file alert plugin — directory-upload example

`multifile_alert/` is a multi-file plugin. The entry point lives in `__init__.py`; threshold logic lives in `processors.py`; argument parsing lives in `config.py`. Demonstrates:
- directory layout for a multi-file plugin
- relative imports between sibling modules
- the `--upload` flow for an entire directory
- argument parsing with `args` and casting strings to typed values

The plugin watches `sensors_demo` (configurable via `args`) and emits an `alert` measurement when any row's `temp` field exceeds `threshold` (default 75.0).

## Wire it up

```bash
# Assumes INFLUXDB_HOST, INFLUXDB_TOKEN (admin), INFLUXDB_DATABASE are set.
# IMPORTANT: --path is the DIRECTORY (the parent containing __init__.py)
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "table:sensors_demo" \
  --path "$(pwd)" \
  --upload \
  --trigger-arguments table=sensors_demo,field=temp,threshold=75.0 \
  multifile_alert
```

> The `--path` is the directory containing `__init__.py`; the upload includes all sibling `.py` files.

## Cause it to fire

```bash
NOW=$(date +%s)
# Below threshold — should NOT alert
curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "sensors_demo,host=server01 temp=70.0 $NOW"
sleep 2
# Above threshold — SHOULD alert
curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "sensors_demo,host=server01 temp=82.5 $((NOW+1))"
sleep 3
```

Check the logs:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='multifile_alert' ORDER BY event_time DESC LIMIT 5"
```

Expected: a `config` line, then an `emitted 1 alert(s) from sensors_demo` line.

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT * FROM alert ORDER BY time DESC LIMIT 5"
```

Expected: at least one alert row with `host=server01`, `field=temp`, `value=82.5`, `threshold=75.0`.

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --force \
  multifile_alert
```
