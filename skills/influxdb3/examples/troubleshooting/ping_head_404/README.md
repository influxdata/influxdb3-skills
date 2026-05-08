# Demo: `HEAD /ping` returns 404

## Symptom

Your monitoring tool's HTTP health check probes `/ping` with `HEAD`. The check reports the server as down (404) even though the server is up and serving queries normally.

## Cause

`/ping` is registered for `GET` only. `HEAD /ping` returns 404. Many health-check tools default to HEAD.

## Diagnostic step

```bash
curl -sS -I "$INFLUXDB_HOST/ping" --max-time 5     # HEAD — returns 404
curl -sS -i  "$INFLUXDB_HOST/ping" --max-time 5    # GET — returns 200
```

If the HEAD returns 404 and the GET returns 200, you've hit this quirk.

## Fix

Switch your health check to `GET`. For tools that won't let you, expose a custom HTTP plugin endpoint via the Processing Engine that responds to either method (Processing Engine plugins can return any status code; see `skills/influxdb3-plugins/references/trigger-types.md` → HTTP request plugins).

## Run

```bash
export INFLUXDB_HOST=http://localhost:8181
export INFLUXDB_TOKEN=<admin token>

bash broken.sh    # exits non-zero with status: 404
bash fixed.sh     # status 200, prints flavor + version
```

## Where to fetch more

- `quirks.md` entry 1
- `references/flavor-detection.md` (uses GET /ping internally)
