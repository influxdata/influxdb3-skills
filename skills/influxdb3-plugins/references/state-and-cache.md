# State and Cache

Plugins are stateless by default — each invocation starts fresh. To persist values across executions, use the in-memory `Cache` exposed via `influxdb3_local.cache`.

The `Cache` API itself is documented in `references/runtime-api.md`. This page covers the patterns and gotchas.

## Two namespaces

| Namespace | Scope | Best for |
|---|---|---|
| **Trigger-local** *(default)* | Isolated to the current trigger; other triggers cannot read or write. | Plugin-internal state — counters, last-run timestamps, intermediate computations. |
| **Global** *(`use_global=True`)* | Shared across every trigger in the process. | Configuration, lookup tables, service handles intentionally shared. |

**Default to trigger-local.** Reach for global only when you have a deliberate reason to share state across plugins.

## Cache lifecycle

- The cache lives in process memory.
- It's **cleared on server restart**. Plugins must handle the cache-cold case (e.g., `cache.get(k, default=...)`).
- TTL is per-key, in seconds. `None` (the default) means no expiry in production caches; in `influxdb3 test ...` simulations, untyped TTL defaults to 30 minutes.

## Common patterns

### Counter

Track how often the plugin has fired. Trigger-local — each trigger has its own counter.

```python
def process_scheduled_call(influxdb3_local, call_time, args=None):
    n = influxdb3_local.cache.get("count", default=0)
    n += 1
    influxdb3_local.cache.put("count", n)
    influxdb3_local.info(f"Plugin run #{n}")
```

### Cached external API response with TTL

Avoid hammering an external service when its data changes slowly.

```python
def process_scheduled_call(influxdb3_local, call_time, args=None):
    rates = influxdb3_local.cache.get("exchange_rates")
    if rates is None:
        import requests
        rates = requests.get("https://api.example.com/rates").json()
        influxdb3_local.cache.put("exchange_rates", rates, ttl=300)  # 5 min
    # ... use rates
```

### Computed lookup table (warm at startup)

A scheduled trigger refreshes a global lookup table that other plugins read.

```python
# Refresher — schedule trigger every:1h, refreshes the global lookup
def process_scheduled_call(influxdb3_local, call_time, args=None):
    rows = influxdb3_local.query("SELECT customer_id, tier FROM customers")
    table = {r["customer_id"]: r["tier"] for r in rows}
    influxdb3_local.cache.put("customer_tiers", table, use_global=True)

# Reader — WAL trigger on writes; reads the global lookup
def process_writes(influxdb3_local, table_batches, args=None):
    tiers = influxdb3_local.cache.get("customer_tiers", default={}, use_global=True)
    for batch in table_batches:
        for row in batch.rows:
            tier = tiers.get(row.get("customer_id"), "unknown")
            # ... use tier
```

### Last-seen timestamp

Skip processing rows already handled.

```python
def process_writes(influxdb3_local, table_batches, args=None):
    last_ts = influxdb3_local.cache.get("last_processed_ns", default=0)
    new_max = last_ts
    for batch in table_batches:
        for row in batch.rows:
            ts = row["time"]
            if ts <= last_ts:
                continue
            # ... process row
            if ts > new_max:
                new_max = ts
    influxdb3_local.cache.put("last_processed_ns", new_max)
```

## Concurrency

If the trigger runs asynchronously (`--run-asynchronous`), multiple invocations of the same plugin can read and write the same cache key concurrently. There's no cross-invocation lock.

Two ways to handle this:
- **Design for idempotency.** Increment-by-1 patterns can lose updates under concurrent writes; design state so a lost update isn't catastrophic.
- **Single-writer pattern.** A scheduled trigger is the only writer; other triggers are readers. Then concurrent reads of stable data are fine.

## When NOT to use the cache

- For data you need across server restarts → write to a database measurement instead. The `Cache` is volatile.
- For very large datasets → it lives in process memory. Watch your memory footprint when caching MB-scale objects.
- For credentials or secrets → use `args` passed to the trigger, not the cache. Args are scoped to the trigger and not exposed elsewhere.

## Where to fetch more

`references/runtime-api.md` for the `Cache` method signatures.
`references/doc-urls.md` → "Extend plugins" for the upstream cache documentation.
