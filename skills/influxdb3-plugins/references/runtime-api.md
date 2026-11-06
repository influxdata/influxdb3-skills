# Plugin runtime API

Every Processing Engine plugin gets the `influxdb3_local` object passed in as the first argument to its entry-point function. This object is the only API the plugin needs for logging, querying data, writing data, and managing in-memory state. **Do not `import` it** — it's injected by the runtime.

## `influxdb3_local`

| Method | Purpose |
|---|---|
| `info(*args)` | Log at `INFO`. Arguments are converted to strings and joined with spaces. Stored in `system.processing_engine_logs` and shown in `influxdb3 test` output. |
| `warn(*args)` | Log at `WARN`; same as `info`. |
| `error(*args)` | Log at `ERROR`; same as `info`. |
| `query(query, args=None, database=None)` | Execute a SQL query. Returns `list[dict[str, Any]]`, one dict per row keyed by column name. `args` values must be strings; an `int` or `float` raises `TypeError`. `database` defaults to the trigger's database. Timestamps are nanosecond integers, and SQL `NULL` is `None`. Raises `QueryError` on bad SQL, execution failure, or an invalid database name (see "Exceptions"). |
| `write_sync(line, no_sync)` | Write to the trigger's database synchronously, while the plugin runs. `no_sync` is required: `True` skips waiting for WAL synchronization, `False` waits for it. Raises if the server rejects the write. |
| `write_sync_to_db(db_name, line, no_sync)` | Same as `write_sync`, to another database. |
| `write(line)` | Queue a write to the trigger's database. Queued writes are flushed after the plugin returns, after any `write_sync` calls. A rejected write can't be caught in the plugin; it surfaces after the run as an `ERROR` row in `system.processing_engine_logs`. |
| `write_to_db(db_name, line)` | Same as `write`, to another database. |
| `cache` | Property returning the `Cache` for this trigger. |

Every write method takes a `LineBuilder` and raises if the target database is `_internal`.
Use `write_sync` or `write_sync_to_db` when the plugin needs to know a write failed.

### `no_sync=True` vs `no_sync=False` — which to pick

| `no_sync=True` | `no_sync=False` |
|---|---|
| Returns as soon as the write is in the in-memory buffer. | Returns only after the write is durably persisted in the WAL. |
| High-throughput plugins that produce many writes per execution (data transformations, aggregations writing back to InfluxDB). | Critical writes where losing the data on a server crash between buffer and WAL sync would be unacceptable. |
| Default for examples in this skill — fits the most common plugin pattern. | Use when losing a buffered write on a server crash is unacceptable. |

Both modes still go through the same write path; the only difference is whether the call blocks until WAL sync.

WAL synchronization and logical deduplication are different properties.
A durable write does not make a retried event safe to repeat.
Overwriting a point isn't deterministic; see the `influxdb3` skill's [`references/quirks.md` entry 13](../../influxdb3/references/quirks.md#13-overwriting-a-point-isnt-deterministic) before promising that a deterministic timestamp makes retries safe.

### Quick examples

```python
# Log
influxdb3_local.info("Processing started")
influxdb3_local.warn("missing field in row", 42)

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
influxdb3_local.write_sync(line, no_sync=True)
```

## `LineBuilder`

Helper for constructing InfluxDB line protocol with type strictness and escaping of the common structural characters (commas, `=`, spaces, and quotes/backslashes in string fields). Constructor: `LineBuilder(measurement: str)` — measurement name cannot contain spaces (raises `InvalidMeasurementError`).

> **`LineBuilder` does not escape newlines (`\n`) or carriage returns (`\r`).** Line protocol treats a newline as a record separator and has no escape for it, so a tag/field value containing `\n`/`\r` will forge an extra point. When a value may contain them (e.g. anything derived from `process_request` input or upstream data), **reject or strip `\n`/`\r` before building the line** — don't rely on `LineBuilder` to neutralize it.

| Method | Purpose |
|---|---|
| `tag(key, value)` | Add a tag (always string). Key cannot contain spaces, commas, or `=`. |
| `int64_field(key, value)` | Add a signed integer field. |
| `uint64_field(key, value)` | Add an unsigned integer field; negative values raise `ValueError`. |
| `float64_field(key, value)` | Add a float field. Integral values render with trailing `.0`. |
| `string_field(key, value)` | Add a string field; quotes and backslashes escaped. |
| `bool_field(key, value)` | Add a boolean field as `t` or `f`. |
| `time_ns(timestamp_ns)` | Set the nanosecond timestamp. Optional; without it, the server assigns the time it received the write. Set it from the event's time when the data has one. |
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
influxdb3_local.write_sync(line, no_sync=True)
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
influxdb3_local.cache.put("weather", {"temp_c": 21.5}, ttl=300)

# Shared config across all triggers
influxdb3_local.cache.put("config", {"threshold": 90}, use_global=True)
```

## `table_batches` shape (WAL plugins only)

What `process_writes` receives. Each item is a **dict** (not a class instance) representing one table's rows from a WAL flush.

| Key | Type | Purpose |
|---|---|---|
| `"table_name"` | str | The measurement / table name. |
| `"rows"` | list of dicts | The rows. Each row dict has all columns (tags, fields, time) keyed by column name. Time is a nanosecond integer. |

> **Important:** access these as dict keys (`batch["table_name"]`, `batch["rows"]`), NOT as attributes. The runtime hands plain dicts even though some upstream type docs describe a `TableBatch` class, so `batch.rows` raises `AttributeError: 'dict' object has no attribute 'rows'`.

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
| `QueryError` | `query()` fails or names an invalid database. |

In plugin code, prefer to validate inputs before constructing a `LineBuilder` rather than catching these — they signal programmer error, not runtime conditions.

`QueryError` isn't importable or defined in plugin globals, so `except QueryError` raises `NameError`.
Catch `Exception` and check the type name:

```python
try:
    rows = influxdb3_local.query("SELECT * FROM cpu")
except Exception as err:
    if type(err).__name__ == "QueryError":
        influxdb3_local.error("query failed:", err)
        return
    raise
```

## Where to fetch more

[`references/doc-urls.md` → "Extend plugins with API features and state management"](doc-urls.md).
