# Plugin Runtime API

Every Processing Engine plugin gets the `influxdb3_local` object passed in as the first argument to its entry-point function. This object is the only API the plugin needs for logging, querying data, writing data, and managing in-memory state. **Do not `import` it** — it's injected by the runtime.

## `influxdb3_local`

| Method | Purpose |
|---|---|
| `info(*args)` | Log an informational message; args stringified and space-joined; written to system logs and `system.processing_engine_logs`. |
| `warn(*args)` | Log a warning; same destinations as `info`. |
| `error(*args)` | Log an error; same destinations; also recorded in the plugin return payload for trigger error tracking. |
| `query(query, args=None)` | Execute a SQL query. Returns `list[dict[str, Any]]` — one dict per row, column name as key. Time columns return as nanosecond integers. Raises `QueryError` on bad SQL or execution failure. |
| `write(line)` | Queue a line protocol write back to the trigger's database; flushed when the plugin completes. `line` must be a `LineBuilder`. |
| `write_sync(line, no_sync=False)` | Synchronous write to the trigger's database via the write buffer. Set `no_sync=True` to skip waiting for WAL synchronization. |
| `write_to_db(db_name, line)` | Queue a line protocol write to a different database. |
| `write_sync_to_db(db_name, line, no_sync=False)` | Synchronous write to a different database. |
| `cache` | Property returning the `Cache` for this trigger. |

### Quick examples

```python
# Log
influxdb3_local.info("Processing started")
influxdb3_local.warn("missing field in row", row_id)

# Query
rows = influxdb3_local.query(
    "SELECT count(*) AS n FROM sensors WHERE time > now() - INTERVAL '1 hour'"
)
n = rows[0]["n"]

# Parameterized query
rows = influxdb3_local.query(
    "SELECT * FROM sensors WHERE host = $host LIMIT 10",
    args={"host": "server01"},
)

# Write back
line = LineBuilder("processed").tag("source", "sensors").int64_field("count", n)
influxdb3_local.write(line)
```

## `LineBuilder`

Helper for constructing InfluxDB line protocol with proper escaping and type strictness. Constructor: `LineBuilder(measurement: str)` — measurement name cannot contain spaces (raises `InvalidMeasurementError`).

| Method | Purpose |
|---|---|
| `tag(key, value)` | Add a tag (always string). Key cannot contain spaces, commas, or `=`. |
| `int64_field(key, value)` | Add a signed integer field. |
| `uint64_field(key, value)` | Add an unsigned integer field; negative values raise `ValueError`. |
| `float64_field(key, value)` | Add a float field. Integral values render with trailing `.0`. |
| `string_field(key, value)` | Add a string field; quotes and backslashes escaped. |
| `bool_field(key, value)` | Add a boolean field as `t` or `f`. |
| `time_ns(timestamp_ns)` | Set the nanosecond timestamp. Optional — server stamps "now" if omitted. |
| `build()` | Render the line protocol string. Raises `InvalidLineError` if no fields were added. |

### Type strictness

A field's type is set on the first write to that measurement. Switching a field from `float64_field` to `string_field` later **fails** — InfluxDB will reject the write. To recover, use a different field name (e.g., `temperature_str` instead of `temperature`) or recreate the measurement.

### Quick example

```python
line = (LineBuilder("sensor")
    .tag("host", "server01")
    .tag("region", "us-west")
    .float64_field("temperature", 72.4)
    .float64_field("humidity", 45.1)
    .time_ns(1714400000_000_000_000))  # optional
influxdb3_local.write(line)
```

## `Cache`

In-memory key-value store for managing state between plugin executions. Cleared on server restart. Access via `influxdb3_local.cache`.

| Method | Purpose |
|---|---|
| `put(key, value, ttl=None, use_global=False)` | Store a Python object. `ttl` is seconds until expiry (None = no expiry in production cache). `use_global=True` writes to the process-wide cache shared across all triggers; default writes to the trigger-local cache. |
| `get(key, default=None, use_global=False)` | Fetch a cached value. Expired entries are evicted on read. Returns `default` if absent. |
| `delete(key, use_global=False)` | Remove a cached value. Returns `True` if the key existed. |

### Two namespaces

- **Trigger-local (default):** isolated per trigger. Use for plugin-internal state (counters, last-run timestamps).
- **Global (`use_global=True`):** shared across all triggers in the process. Use for config or lookup tables intentionally shared.

### Quick example

```python
# Counter pattern
counter = influxdb3_local.cache.get("count", default=0)
counter += 1
influxdb3_local.cache.put("count", counter)

# Cache an external API response with a TTL
influxdb3_local.cache.put("weather", api_response, ttl=300)

# Shared config across all triggers
influxdb3_local.cache.put("config", {"threshold": 90}, use_global=True)
```

## `table_batches` shape (WAL plugins only)

What `process_writes` receives. Each item is a **dict** (not a class instance) representing one table's rows from a WAL flush.

| Key | Type | Purpose |
|---|---|---|
| `"table_name"` | str | The measurement / table name. |
| `"rows"` | list of dicts | The rows. Each row dict has all columns (tags, fields, time) keyed by column name. Time is a nanosecond integer. |

> **Important:** access these as dict keys (`batch["table_name"]`, `batch["rows"]`), NOT as attributes. The runtime hands plain dicts even though some upstream type docs describe a `TableBatch` class.

### Quick example

```python
def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        table_name = batch["table_name"]
        rows = batch["rows"]
        influxdb3_local.info(f"Got {len(rows)} rows from {table_name}")
        for row in rows:
            ts = row["time"]                # nanosecond int
            host = row.get("host")          # tag (string)
            temp = row.get("temperature")   # field (typed)
```

## Exceptions

| Exception | Raised when |
|---|---|
| `InfluxDBError` | Base class for plugin-side line protocol / write errors. |
| `InvalidMeasurementError` | Measurement name contains a space. |
| `InvalidKeyError` | Tag or field key is empty or contains spaces, commas, or `=`. |
| `InvalidLineError` | `LineBuilder.build()` called with no fields. |

In application code, prefer to validate inputs before constructing a `LineBuilder` rather than catching these — they signal programmer error, not runtime conditions.

## Where to fetch more

`references/doc-urls.md` → "Extend plugins with API features and state management".
