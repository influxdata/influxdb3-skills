# Performance — Server-Side Triage

Deep server-side analysis of slow queries and slow writes. This is the home for the performance content the `influxdb3` skill defers.

> **Handoff:** the `influxdb3` skill owns *client-side quick triage* — add a time filter, add `LIMIT`, batch writes (see its `references/troubleshooting.md` → "Performance hints" and `references/writing.md`). **THIS** reference owns *server-side* analysis: reading `system.queries`, the query-engine `/metrics`, and the documented tuning knobs. If the customer hasn't tried the client-side fixes yet, send them there first.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. The `system.queries` SQL was run against `--database _internal`; every `/metrics` series below appeared in a live scrape. `/metrics` requires Bearer auth.

## Slow query triage (server side)

Work the checklist in order — each step is tied to a verified signal. Start with the heavy-query inventory; it tells you which step to focus on.

**1. Missing time filter / unbounded `SELECT *`.** The single most common cause. Inspect the heaviest recent (completed) queries:

```sql
SELECT query_text, end2end_duration, execute_duration, parquet_files, partitions, max_memory, success
FROM system.queries
WHERE running = false
ORDER BY end2end_duration DESC
LIMIT 10;
```

Read it: a long `end2end_duration` with a `query_text` that has no `WHERE time > …` and/or no `LIMIT` is the client-side fix (hand back to the `influxdb3` skill). High `execute_duration` relative to `end2end_duration` means time is spent in the engine, not waiting — read on. Few rows on a quiet instance is fine; the shape is what matters.

**2. High cardinality.** A query touching a high-cardinality table materializes far more series than expected, inflating `execute_duration` and `max_memory` even with a time filter. See `references/cardinality.md`.

**3. Compaction backlog.** Many small Parquet files scanned per query shows up as a high `parquet_files` (and often high `partitions`) value in the inventory above — the engine opens hundreds of tiny files instead of a few compacted ones. See `references/storage-and-compaction.md` for confirming the backlog and how compaction consolidates.

**4. Resource saturation.** If the heavy queries aren't obviously unbounded and cardinality/compaction look healthy, the node may be CPU- or memory-bound. Cross-check the query-engine histograms in a `/metrics` scrape against the `system.queries` durations:

```bash
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/metrics" \
  | grep -E 'influxdb_iox_query_log_(execute_duration_seconds|end2end_duration_seconds|num_rows|parquet_files|max_memory|phase_current)'
```

`influxdb_iox_query_log_execute_duration_seconds` / `_end2end_duration_seconds` are the latency distributions; `_num_rows`, `_parquet_files`, `_max_memory` quantify per-query work; `_phase_current` shows queries in flight. For memory pool saturation and OOM specifically, see `references/memory-and-resources.md`. For how to read `/metrics` generally, see `references/observability.md`.

## Slow write triage

**Batch size first.** Tiny or oversized batches dominate write latency; this is mostly client-side — see `skills/influxdb3/references/writing.md` for the 1,000–10,000-points-per-request batching rule and backoff.

**Ingest rate.** Confirm requests are actually arriving and watch their status mix:

```bash
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/metrics" | grep '^http_requests_total'
```

A flat counter means writes aren't reaching the server (client/network); rising 4xx/5xx labels point at rejected or failing batches.

**Object-store latency.** If ingest is steady but slow, the persistence path may be the bottleneck:

```bash
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/metrics" \
  | grep -E '^(object_store_op_duration_seconds|object_store_transfer_bytes_total)'
```

`object_store_op_duration_seconds` is the per-operation latency distribution; `object_store_transfer_bytes_total` is throughput. High op duration against a remote store (S3/GCS) points at network or store-side limits — tune the connection/retry knobs below. See `references/storage-and-compaction.md` for the storage-layer model.

## Documented tuning knobs

From the Performance tuning doc (Core and Enterprise — see `references/doc-urls.md`). Only what the doc documents; tune to workload, not blindly.

| Knob | What the doc says |
|---|---|
| `--datafusion-num-threads` | Query/snapshot execution threads (defaults to available cores). The primary thread-count knob in 3.10; raise on query-heavy nodes and tune per node mode (ingest vs. query vs. compact) on Enterprise. |
| `--wal-flush-interval` | Write latency vs. throughput. Default `1s`; reduce toward `100ms` for lower-latency ingest. |
| `--max-http-request-size` | Max HTTP request size. Default `10 MB`; raise for large write batches. |
| `--object-store-connection-limit` / `--object-store-max-retries` / `--object-store-http2-only` | Object-store connection pool, retry, and HTTP/2 behavior for cloud stores — the knobs for the object-store latency signal above. |
| `--gen1-lookback-duration` | Startup optimization — bounds how far back gen1 file metadata is loaded into the in-memory index at startup; lower it to speed startup on large datasets. |
| `--checkpoint-interval` (per perf-tuning docs; not present in 3.10 nightly — verify for your build) | Doc describes a startup optimization that consolidates snapshot metadata and recommends `1h` in production. |

**Memory-pool and snapshot thresholds** (`--exec-mem-pool-bytes`, `--parquet-mem-cache-size`, `--force-snapshot-mem-threshold`) are also in this doc, but they're covered with the OOM/disk context in `references/memory-and-resources.md` — go there rather than re-tuning them here.

**Enterprise:** the doc emphasizes per-node-mode tuning (`--mode=ingest|query|compact`); each mode wants a different DataFusion thread allocation and resource balance. For multi-node sizing beyond the documented examples, point to the canonical page in `references/doc-urls.md` rather than inventing numbers.
