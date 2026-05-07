# Trigger Types and Entry Points

Processing Engine plugins come in three flavors, each with its own entry-point function and trigger-spec syntax. Pick the one that matches the firing event you want.

## Decision table

| Goal | Trigger type | Entry-point function | Trigger spec |
|---|---|---|---|
| Process data as it's written to a table | WAL / data-write | `process_writes` | `table:<name>` or `all_tables` |
| Run code at intervals or specific times | Scheduled | `process_scheduled_call` | `every:<duration>` or `cron:<expr>` |
| Expose a custom HTTP endpoint | HTTP request | `process_request` | `request:<path>` |

All three trigger types share the same `influxdb3_local` runtime API (`references/runtime-api.md`) and the same `args: Mapping[str, str] | None` parameter (passed via `--trigger-arguments key=value,...`).

---

## WAL / data-write trigger

```python
def process_writes(influxdb3_local, table_batches, args=None):
    """Fires when the WAL flushes (default ~1s).

    table_batches: Sequence[TableBatch] — one per table, with rows already grouped.
    args: Mapping[str, str] | None — trigger arguments passed at trigger-creation time.
    """
    for batch in table_batches:
        influxdb3_local.info(f"{batch.table_name}: {len(batch.rows)} rows")
```

### Trigger specs

- `table:<name>` — fires only on writes to the named table.
- `all_tables` — fires on writes to any table in the database.

### Use cases

- Data transformation and enrichment (write derived rows back via `influxdb3_local.write(...)`)
- Threshold alerting on incoming values
- Computing per-batch aggregates and writing them as derived measurements

### Patterns to study

In `~/Projects/influxdb3_plugins/influxdata/`:
- `state_change/` — state-machine WAL plugin pattern
- `threshold_deadman_checks/` — WAL alerting on threshold crossings
- `schema_validator/` — WAL validation pattern

---

## Scheduled trigger

```python
def process_scheduled_call(influxdb3_local, call_time, args=None):
    """Fires on a schedule.

    call_time: datetime — UTC fire time as naive datetime.
    args: Mapping[str, str] | None — trigger arguments.
    """
    rows = influxdb3_local.query(
        "SELECT count(*) AS n FROM sensors WHERE time > now() - INTERVAL '5 minutes'"
    )
    n = rows[0]["n"] if rows else 0
    influxdb3_local.info(f"Sensors writes in last 5 min: {n}")
```

### Trigger specs

- `every:<duration>` — `every:30s`, `every:5m`, `every:1h`. The duration is the cadence.
- `cron:<expression>` — extended cron with seconds: 6 fields (`sec min hour dom mon dow`). Example: `cron:0 0 8 * * *` for 8 AM daily.

### Use cases

- Periodic aggregation (downsampling)
- System-health checks
- Report generation
- External-API polling with results written back as line protocol

### Patterns to study

- `system_metrics/` — periodic host metrics collection
- `downsampler/` — scheduled aggregation
- `prophet_forecasting/` — scheduled forecast generation

---

## HTTP request trigger

```python
def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):
    """Fires when an HTTP request arrives at /api/v3/engine/<trigger_path>.

    query_parameters: Mapping[str, str]
    request_headers: Mapping[str, str]
    request_body: bytes
    args: Mapping[str, str] | None
    """
    import json
    if request_body:
        payload = json.loads(request_body)
        influxdb3_local.info("got payload", payload)
    return {"status": "ok"}, 200
```

### Trigger specs

- `request:<path>` — exposes the endpoint at `/api/v3/engine/<path>`. Example: `request:webhook` exposes `/api/v3/engine/webhook`.

### Return shapes

The return value is converted to an HTTP response. Accepted shapes:

- A `(body, status, headers)` tuple — Flask conventions; `status` and `headers` optional.
- A Flask `Response` instance.
- A bare `str` — text/html, status 200.
- A bare `dict` or `list` — JSON-encoded with `Content-Type: application/json`, status 200.
- A bare iterator — concatenated, text/html, status 200.

### Use cases

- Webhooks for external integrations
- Custom query endpoints (parse query params, run a SQL query, return JSON)
- Lightweight UIs over your data

### Patterns to study

- `notifier/` — HTTP plugin pattern with structured returns

---

## Trigger arguments

All three trigger types take an `args: Mapping[str, str] | None` parameter. Arguments are passed at trigger-creation time:

```bash
influxdb3 create trigger \
  --trigger-spec "every:1h" \
  --path "threshold_check.py" \
  --trigger-arguments threshold=90,notify_email=admin@example.com \
  --database my_database \
  threshold_monitor
```

Inside the plugin:

```python
def process_scheduled_call(influxdb3_local, call_time, args=None):
    if args:
        threshold = float(args.get("threshold", "100"))  # always cast — args values are strings
        email = args.get("notify_email", "default@example.com")
```

**Important:** every value in `args` arrives as a string. Cast inside the plugin (`int()`, `float()`, etc.).

## Where to fetch more

`references/doc-urls.md` → "Processing engine and Python plugins" → trigger-spec syntax section.
