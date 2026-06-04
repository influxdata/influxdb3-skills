# Memory & Resource Pressure — OOM and Disk

When the process is dying, queries are getting killed, or the disk is filling. The memory pool and storage layout are the two things to reason about. For the `/metrics` angle generally, see `references/observability.md`; for what fills disk and how compaction reclaims it, see `references/storage-and-compaction.md`; for the server flags named below, see `references/configuration.md`.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Metric series below appeared in a live `/metrics` scrape; the `system.queries` SQL was run against `--database _internal`. `/metrics` requires Bearer auth.

## OOM (out of memory)

**Symptoms:** the process is killed by the OS (exit signal / `OOMKilled` / SIGKILL in logs, container restart with no clean shutdown), and/or the query engine's OOM counter climbs:

```bash
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/metrics" \
  | grep -E 'query_datafusion_query_execution_ooms_total|datafusion_mem_pool_bytes'
```

`query_datafusion_query_execution_ooms_total` rising is the key signal that queries are hitting the pool ceiling. `datafusion_mem_pool_bytes{state="reserved"}` approaching `{state="limit"}` means the pool is saturated. (On the verified host, `limit` was ~7.73 GB — the Enterprise default `20%` of host RAM.)

**Top causes:** (1) the memory pool sized too high relative to host RAM, so the pool plus everything else exceeds physical memory and the OS kills the process; (2) huge un-batched writes; (3) high-cardinality or unbounded queries (no `LIMIT`, no time filter) that try to materialize too much at once; (4) **in-memory caches** — the Last Value Cache (LVC) and Distinct Value Cache (DVC) live outside the query pool and grow with the cardinality of the data they cover, so a cache on a high-cardinality table adds non-query memory the OS counts against the process. See `references/cardinality.md` for how to inspect and size them.

**Diagnose (in order):**

1. **Check the OOM counter and pool saturation** with the scrape above. A rising counter with `reserved` near `limit` = queries are the problem; the process surviving but queries failing points here. A process getting OS-killed with the counter flat points at the pool being sized larger than RAM can support, or non-query memory (writes/cache).
2. **Find the heavy queries:**

   ```sql
   SELECT query_text, max_memory, execute_duration, success
   FROM system.queries
   ORDER BY max_memory DESC
   LIMIT 10;
   ```

   `max_memory` is the peak memory (bytes) per query. The biggest consumers with `success = false` are the ones being killed at the pool ceiling. (Few rows is fine on a quiet instance — the shape is what matters; the in-flight query itself shows null/false.)
3. **Compare pool size to host RAM.** If the pool limit is a large fraction of total RAM, the headroom for writes, cache, and the OS is too small.

**Remediation:**

- **Size `--exec-mem-pool-bytes` for the host** (env `INFLUXDB3_EXEC_MEM_POOL_BYTES`). Accepts absolute bytes (`8000000000`) or a percentage (`20%`); Enterprise default `20%`. Per the perf-tuning doc, tune to workload: write-heavy `60-70%`, query-heavy `80-90%`, mixed `70%` — leaving room for OS page cache. If the process is being OS-killed, lower it; if queries OOM but the host has spare RAM, raise it.
- **Relieve write-side memory pressure** with `--force-snapshot-mem-threshold` (doc-recommended `90%` write-heavy, `80%` general, `70%` memory-constrained) to force snapshots before memory runs out.
- **Batch writes** 1,000–10,000 points per request rather than one giant payload — see `skills/influxdb3/references/writing.md`.
- **Fix cardinality / unbounded queries** — add `LIMIT` and a time filter; move high-cardinality values off tags. See `references/cardinality.md`.

## Disk pressure

Disk fills at two different layers, and the fix differs by layer (full model in `references/storage-and-compaction.md`).

- **Local disk** holds the WAL (recent writes buffered for fast query access), the **Parquet cache** of recently-read persisted files, and logs. The cache size is observable as `influxdb3_parquet_cache_size_bytes` and bounded by `--parquet-mem-cache-size`; the WAL is bounded by the buffer window. Local disk growing unboundedly is usually the cache or log volume, not raw data.
- **Object store** holds persisted Parquet, the catalog, and the WAL copy. It grows with ingested-then-persisted data and only shrinks when retention/compaction removes files.

**Read usage:** scrape `influxdb3_parquet_cache_size_bytes` for cache footprint; query `system.parquet_files` (grouped per table) for persisted object-store usage — both shown in `references/storage-and-compaction.md`. The diagnostic toolkit at `examples/diagnose-ops/` collects these in one pass.

**SAFETY — never hand-delete WAL or Parquet files.** Deleting files out from under a running (or stopped) server causes data loss and catalog corruption. Reclaim space through retention and compaction, or by lowering `--parquet-mem-cache-size`, never with `rm`. If you suspect corruption, do not attempt repair — route to InfluxData support.

## Sizing guidance

The perf-tuning doc (Core and Enterprise) gives example system tiers. Use them as starting points, not guarantees:

| Tier | Cores | RAM | Exec pool | Parquet cache |
|---|---|---|---|---|
| Small | 4 | 16 GB | `--exec-mem-pool-bytes` ≈ 10GB | `--parquet-mem-cache-size=500MB` |
| Medium | 16 | 64 GB | ≈ 45GB | `2GB` |
| Large | 64 | 256 GB | ≈ 200GB | `10GB` |

For anything beyond these documented examples, point to the canonical pages rather than inventing numbers — see `references/doc-urls.md` (Performance tuning, Core and Enterprise).
