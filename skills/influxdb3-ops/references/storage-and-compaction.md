# Storage, Retention Enforcement & Compaction

How InfluxDB 3 stores data, when retention actually deletes it, and how to observe compaction. For the server flags that select the object store, see `references/configuration.md`. For the `/metrics` angle on these subsystems, see `references/observability.md`. Retention *configuration* (the CLI/API to set a retention period) belongs to the `influxdb3` skill — `skills/influxdb3/references/databases.md`.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. System-table queries below were run against `--database _internal`. Durability cadences are from the official durability internals doc (see `references/doc-urls.md`).

## The storage layers

Writes flow through two layers, and "disk is filling up" means a different thing at each:

1. **WAL (write-ahead log) — recent writes, local + object store.** The server validates a write into an in-memory write buffer, then **"every second (default), the database flushes the write buffer to the Write-Ahead Log (WAL) for persistence in the object store."** Acknowledgement waits for that flush (default `no_sync=false`), so an ack means durable. The server keeps **up to 900 WAL files (~15 minutes of data) buffered** for fast query access.
2. **Persisted Parquet — long-term, object store.** **"Every ten minutes (default), InfluxDB 3 persists the oldest data from the queryable buffer to the object store in Parquet format."** The most recent ~5 minutes stays in memory; older Parquet files are cached locally to cut object-store latency.

So **local disk** grows from WAL files plus the **parquet cache** (`influxdb3_parquet_cache_size_bytes`), and is roughly bounded by the buffer windows and cache size; **object-store** usage grows with persisted Parquet and only shrinks when retention/compaction removes files. Local disk filling unboundedly usually means the parquet cache size, not data — check `references/configuration.md` for the cache and data-dir flags.

## Retention enforcement

Retention is enforced in **two stages**, and the gap between them is the source of nearly every "retention isn't working" report. This file is the canonical home for that symptom.

- **Query-time filtering is immediate.** Per the docs, "any points with timestamps beyond a retention period are filtered out of query results, even though the data may still exist in storage." Set a 7d retention and a 10-day-old point stops appearing in queries right away.
- **Physical deletion is periodic, not instant.** The retention enforcement service "runs periodically" and removes expired files later. The docs do **not** publish an exact interval; timing "depends on: the retention enforcement service schedule, the compaction strategy configured for your installation, and the ratio of expired to non-expired data in Parquet files." So expired data can persist on disk/object-store until the next sweep — that is expected, not a bug.

**Symptom — "retention not applying":** old data still occupies disk after the window passed. **Diagnose:** confirm the configured window first, then explain the two-stage model above. If queries already exclude the old data, retention *is* working; physical reclamation lags.

```sql
-- Read the configured retention per database (ns; 0 = infinite)
SELECT database_name, retention_period_ns FROM system.databases;
```

**Fix:** if queries correctly exclude the data, no action — wait for the sweep. If queries still *return* over-retention data, the retention period itself is wrong/unset — set it via the admin surface in `skills/influxdb3/references/databases.md`.

## Compaction

Compaction merges many small Parquet files into fewer, larger, time-sorted ones across generations (levels), reclaiming space and speeding queries. A **backlog** looks like: small files accumulating, compaction events slowing or erroring, and rising query latency over historical ranges.

Observe recent compaction activity (`event_duration` is in nanoseconds; `event_type` includes values like `snapshot_fetched`):

```sql
SELECT event_time, event_type, event_status, event_duration
FROM system.compaction_events
ORDER BY event_time DESC
LIMIT 20;
```

Watch for `event_status` other than `success`, or `event_duration` climbing over time. The per-generation target durations show the level tiers the compactor rolls data through:

```sql
SELECT level, duration_seconds FROM system.generation_durations;
```

On the verified host this returned levels 1–6 with durations 600s → 432000s (10 min up to 5 days), i.e. each higher generation covers a wider time span. For a metrics-based view of progress, the `influxdb3_compaction_sequence_number` series advances as compaction runs — a flat sequence under sustained writes signals a stall (`references/observability.md`).

## Disk / storage inspection

Persisted Parquet usage per table, largest first:

```sql
SELECT table_name, sum(size_bytes) AS bytes, sum(row_count) AS rows
FROM system.parquet_files
GROUP BY table_name
ORDER BY bytes DESC;
```

(`size_bytes` and `row_count` are per-file; this aggregates them per table. On an instance with no user data it returns no rows — that's expected; the shape is what matters.) Use this to find the table driving object-store growth before deciding whether the fix is retention, downsampling, or schema/cardinality.

## Object-store errors

The object store holds the WAL, the catalog, and all Parquet — so its failure modes split by *when* they appear:

- **At startup:** bad bucket name, wrong region, or invalid credentials surface as a fail-fast — the catalog can't load (S3 403/404, GCS/Azure auth failure). The server won't come up.
- **At runtime:** transient connectivity, throttling, or a permission change on an already-running node shows up as persisting/compaction failures, growing local WAL backlog, and errors in `system.compaction_events` (`event_status` ≠ `success`). Watch `object_store_op_duration_seconds` and `object_store_transfer_bytes_total` for latency/throughput regressions (`references/observability.md`).

**Fix:** verify the object-store flags and credentials — the required-flag matrix per backend and the exact failure-if-wrong notes live in `references/configuration.md` → "Object-store config".
