# Demo: `table_batches` attribute access (plugin runtime)

## Symptom

Your WAL plugin's logs show:

```
AttributeError: 'dict' object has no attribute 'rows'
```

## Cause

The Processing Engine runtime hands **plain dicts** to `process_writes(...)`, not class instances — even though some upstream type documentation describes a `TableBatch` class with `.rows` and `.table_name` attributes. The actual runtime value is a dict with keys `"rows"` (list of dicts) and `"table_name"` (str).

## Diagnostic step

Read the plugin's recent log output:

```bash
influxdb3 query -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_text FROM system.processing_engine_logs
   WHERE trigger_name = '<your_trigger_name>' AND log_level = 'ERROR'
   ORDER BY event_time DESC LIMIT 10"
```

Look for `AttributeError: 'dict' object has no attribute`. That's the symptom.

## Fix

Use dict access instead. `fixed.py` shows the corrected pattern.

```python
# Wrong
for batch in table_batches:
    n = len(batch.rows)                # AttributeError
    name = batch.table_name             # AttributeError

# Right
for batch in table_batches:
    n = len(batch["rows"])
    name = batch["table_name"]
```

## Run (live, on the server)

This demo is a plugin file. To exercise it on the live server:

```bash
# Upload the broken plugin and create a WAL trigger
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --trigger-spec "table:demo_attr" \
  --path "$(pwd)/broken.py" \
  --upload \
  --token "$INFLUXDB_TOKEN" \
  attr_demo_broken

# Cause it to fire by writing a point to the watched table
NOW=$(date +%s)
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "demo_attr,host=h1 value=1.0 $NOW"
sleep 3

# Read the logs — should show AttributeError
influxdb3 query -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs
   WHERE trigger_name='attr_demo_broken' ORDER BY event_time DESC LIMIT 5"

# Now swap to the fixed version
influxdb3 update trigger \
  --database "$INFLUXDB_DATABASE" \
  --trigger-name attr_demo_broken \
  --path "$(pwd)/fixed.py" \
  --token "$INFLUXDB_TOKEN"

# Fire again
NOW=$(date +%s)
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "demo_attr,host=h1 value=2.0 $NOW"
sleep 3

# Read the logs again — should show "got 1 rows from demo_attr"
influxdb3 query -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs
   WHERE trigger_name='attr_demo_broken' ORDER BY event_time DESC LIMIT 5"

# Cleanup
influxdb3 delete trigger --database "$INFLUXDB_DATABASE" --force --token "$INFLUXDB_TOKEN" attr_demo_broken
```

## Where to fetch more

- `quirks.md` entry 3 (canonical home for this quirk)
- `skills/influxdb3-plugins/references/runtime-api.md` → "table_batches shape"
- `skills/influxdb3-plugins/references/troubleshooting.md` → "Plugin errors in `system.processing_engine_logs`"
