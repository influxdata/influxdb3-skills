# HTTP request plugin — hello-world

`process_request_hello.py` exposes `/api/v3/engine/echo`. GET returns a status object; POST with a JSON body echoes the body back.

## Wire it up

```bash
# Assumes INFLUXDB_HOST, INFLUXDB_TOKEN (admin), INFLUXDB_DATABASE are set.
influxdb3 create trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --trigger-spec "request:echo" \
  --path "$(pwd)/process_request_hello.py" \
  --upload \
  request_hello
```

## Cause it to fire

```bash
# GET — should return the status object
curl -sS "$INFLUXDB_HOST/api/v3/engine/echo" -H "Authorization: Bearer $INFLUXDB_TOKEN"

# POST a JSON body
curl -sS -X POST "$INFLUXDB_HOST/api/v3/engine/echo" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"hello":"world","n":42}'

# POST invalid JSON — should return 400
curl -sS -X POST "$INFLUXDB_HOST/api/v3/engine/echo" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  --data 'not-json'
```

Expected:
- GET → `{"status":"ok","hint":"POST a JSON body to echo it back"}` (status 200).
- POST valid JSON → `{"echo":{"hello":"world","n":42},"len":<n>}` (status 200).
- POST invalid JSON → `{"error":"invalid JSON body"}` (status 400).

Check the logs:

```bash
influxdb3 query \
  -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs WHERE trigger_name='request_hello' ORDER BY event_time DESC LIMIT 5"
```

Expected: lines like `echo plugin called with body length 24`.

## Cleanup

```bash
influxdb3 delete trigger \
  --database "$INFLUXDB_DATABASE" \
  --token "$INFLUXDB_TOKEN" \
  --force \
  request_hello
```
