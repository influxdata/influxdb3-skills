# Observability — Logs, /metrics, and system.* Tables

The three signal sources for diagnosing a running InfluxDB 3 node. Start here: logs tell you *what happened* (startup, errors, panics), `/metrics` tells you *how the process is behaving right now* (memory, traffic, latency), and `system.*` tables tell you *what work the database is doing* (queries, compaction, cluster, license). Most ops investigations begin by sampling all three. Deeper use of these signals lives in `references/performance.md` (query latency), `references/storage-and-compaction.md` (disk, parquet, compaction), `references/memory-and-resources.md` (OOM, pool), and `references/cardinality.md` (high-cardinality schema).

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Every metric series below appeared in a live `/metrics` scrape; every SQL was run against `--database _internal`; every flag appears in `influxdb3 serve --help-all`. `/metrics` requires Bearer auth.

## Server logs

Where logs land depends on how the node was started:

- **Docker:** `docker logs <container>` (add `-f` to follow, `--since 10m` to bound).
- **systemd:** `journalctl -u influxdb3 -f` (the unit name may differ on your host).
- **Foreground / direct invocation:** stdout — logs go to the terminal. This is also the default destination inside containers.

Logging is controlled by these `serve` flags (all have `INFLUXDB3_*` env equivalents):

| Flag | Env | Default | Purpose |
|------|-----|---------|---------|
| `--log-filter <FILTER>` | `INFLUXDB3_LOG_FILTER` | `info,iox_query::query_log=warn,influxdb3_query_executor::enterprise=warn` | Verbosity, `tracing`-style directive. Set to `debug` or `trace` for more detail; supports per-module targets (e.g. `info,influxdb3_write=debug`). |
| `--log-format <FORMAT>` | `INFLUXDB3_LOG_FORMAT` | `full` | Message format. Use a structured format for log aggregators. |
| `--log-destination <DEST>` | `INFLUXDB3_LOG_DESTINATION` | `stdout` | Where log lines are written. |
| `-v, --verbose` | — | off | Shorthand to increase verbosity. |

When `--log-filter` starts with `debug`/`trace`, the server auto-quiets noisy modules (e.g. `object_store_metrics=info`) unless you also set `--disable-log-filter-noise-reduction`.

**Log signals an operator watches:**

- **Startup success** — the server logs that it has bound its HTTP/gRPC listeners and finished catalog load. Absence of this line (or a process that exits before it) means the node never came up; the last lines before exit name the cause (bad object-store config, port in use, license).
- **Object-store errors** — repeated errors mentioning the object store (S3/GCS/Azure auth, timeouts, 403/404) point at the durable layer and usually correlate with `object_store_op_duration_seconds` latency in `/metrics`.
- **Panics** — a `panicked` / backtrace line is always abnormal; cross-check `thread_panic_count_total` in `/metrics`. A panic followed by no further logs means the process died.

## The `/metrics` endpoint

Prometheus text-format metrics, served by the node. **Gotcha:** unlike most Prometheus exporters, this endpoint **requires Bearer auth** — a scraper with no credentials gets rejected. Configure the token in your Prometheus `authorization` / `bearer_token` scrape config; for ad-hoc scrapes pass the header:

```bash
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/metrics"
```

Prometheus type rules apply: `*_total` are counters (rate them — the absolute value is cumulative), `*_bytes` / `*_current` / `*_alive_tasks` are gauges (read directly), `*_seconds` are histograms (`_bucket`/`_sum`/`_count`, use for percentiles).

Key series (all confirmed present in the live scrape), grouped by concern:

| Series | Type | What it tells you | Healthy vs unhealthy |
|--------|------|-------------------|----------------------|
| **Memory** | | | |
| `datafusion_mem_pool_bytes{state="limit"\|"reserved"}` | gauge | Query memory pool ceiling and current reservation | `reserved` well below `limit` = headroom; `reserved` riding at `limit` = pool saturated, queries about to fail |
| `jemalloc_memstats_bytes` | gauge | Total allocator footprint of the process | Steady/plateauing = healthy; monotonic climb = leak or unbounded growth toward OS OOM |
| `query_datafusion_query_execution_ooms_total` | counter | Queries killed at the pool ceiling | Flat = fine; rising = queries OOMing (see `references/memory-and-resources.md`) |
| **Traffic** | | | |
| `http_requests_total` | counter | HTTP request volume by handler/status | Rate it; a spike in 5xx labels = server-side failures |
| `http_request_duration_seconds` | histogram | HTTP latency distribution | Stable percentiles = healthy; rising tail = overload/slow queries |
| `http_response_body_size_bytes` | histogram | HTTP response payload sizes | Sudden growth = unbounded result sets |
| `grpc_requests_total` | counter | gRPC (Flight) request volume | As above, for the Flight/Arrow path |
| `grpc_request_duration_seconds` | histogram | gRPC latency distribution | As above |
| **Query engine** | | | |
| `influxdb_iox_query_log_execute_duration_seconds` | histogram | Time spent executing queries | Rising = slow queries; see `references/performance.md` |
| `influxdb_iox_query_log_end2end_duration_seconds` | histogram | Full request-to-result query latency | Compare against execute to spot planning/permit overhead |
| `influxdb_iox_query_log_num_rows` | histogram | Rows returned per query | Huge values = unbounded scans |
| `influxdb_iox_query_log_parquet_files` | histogram | Parquet files touched per query | High counts = poor pruning or pending compaction |
| `influxdb_iox_query_log_max_memory` | histogram | Peak memory per query | Tail near pool limit = OOM risk |
| `influxdb_iox_query_log_phase_current` | gauge | Queries currently in each phase | Many stuck in one phase (e.g. permit) = contention |
| **Compaction / parquet cache** | | | |
| `influxdb3_compaction_sequence_number` | gauge | Latest compaction sequence this node has seen (Parquet-mode signal) | Should advance over time; flat = compaction stalled |
| `influxdb3_compactor_snapshots_pending` | gauge | Snapshots waiting to be scheduled into compaction plans (**PachaTree only** — present only when `--use-pacha-tree` is active) | 0 = caught up; sustained non-zero = compaction backlog |
| `influxdb3_compactor_snapshot_poll_duration_seconds` | histogram | Compactor snapshot poll-cycle latency (**PachaTree only**) | Rising tail = compactor falling behind |
| `influxdb3_parquet_cache_size_bytes` | gauge | In-memory read-cache footprint (present in **both** formats — this is the shared Parquet read cache) | Bounded by `--parquet-mem-cache-size`; pinned at max = under cache pressure |
| `influxdb3_parquet_cache_size_number_of_files` | gauge | Files held in the read cache (both formats) | Context for the byte size above |
| `influxdb3_parquet_cache_access_total` | counter | Cache accesses (by hit/miss; both formats) | Falling hit ratio = cache too small for the read pattern |
| **Object store** | | | |
| `object_store_op_duration_seconds` | histogram | Object-store operation latency | Rising = slow/throttled durable layer; correlate with log errors |
| `object_store_op_ttfb_seconds` | histogram | Time-to-first-byte from object store | High TTFB = network/region/throttle issue |
| `object_store_transfer_bytes_total` | counter | Bytes moved to/from object store | Rate it to see read/write throughput |
| `object_store_transfer_objects_total` | counter | Objects moved to/from object store | Rate it alongside bytes |
| **Runtime health** | | | |
| `process_start_time_seconds` | gauge | Process start (unix epoch) | A change = the process restarted (crash/redeploy) |
| `tokio_runtime_num_alive_tasks` | gauge | Live async tasks in the runtime | Steady = healthy; unbounded growth = task leak/backpressure |
| `tokio_watchdog_hangs_total` | counter | Hangs detected by the tokio watchdog | Any increase = the async runtime stalled (blocking work on async threads) |
| `thread_panic_count_total` | counter | Thread panics observed | Anything above 0 is abnormal; cross-check logs |

## `system.*` tables

Queryable diagnostic tables in the `system` schema. Query them through the `_internal` database with the CLI (or any SQL client). Operator-relevant tables: `queries`, `compaction_events`, `nodes`, `license`, plus `parquet_files`, `databases`, `tables`.

**Which tables apply depends on the storage format.** The file-inventory and compaction tables differ between Parquet and PachaTree (Enterprise) mode — detect the format first per `references/storage-format.md`. In Parquet mode the inventory/compaction surfaces are `system.parquet_files` and `system.compaction_events`; in PachaTree mode a family of `system.pt_*` tables takes their place (see "PachaTree mode" below). The query/node/license/cache tables are identical in both.

```bash
INFLUXDB3_AUTH_TOKEN="$INFLUXDB_TOKEN" "$INFLUXDB3_CLI" query --database _internal \
  --host "$INFLUXDB_HOST" "<SQL>"
```

**In-flight and recent queries** (`system.queries`) — what the query engine is doing right now and what just ran. The in-flight query shows `running = true` with null durations; `success = false` on a completed row is a failed/killed query. Deeper triage in `references/performance.md`.

```sql
SELECT query_text, phase, success, running, execute_duration, end2end_duration, max_memory
FROM system.queries
ORDER BY issue_time DESC
LIMIT 10;
```

**Compaction activity** (`system.compaction_events`) — whether the background compactor is keeping up. `event_status = success` events advancing in time = healthy; gaps or failures = files not being merged (more files per query, growing object store). Full model in `references/storage-and-compaction.md`.

```sql
SELECT event_time, event_type, event_status, event_duration
FROM system.compaction_events
ORDER BY event_time DESC
LIMIT 10;
```

**Node / cluster status** (`system.nodes`) — every node, its `mode` (e.g. `[all]`, ingest, query, compact), `core_count`, and `state`. A node missing or not `running` is a cluster problem.

```sql
SELECT node_id, mode, core_count, state
FROM system.nodes;
```

**License status** (`system.license`) — Enterprise licensing: type, licensed vs available cores, and expiry. An imminent `expires_at` or `available_cores` below your node's core count is an operational risk. (On the verified host these fields were empty; the query still runs and the columns are valid.)

```sql
SELECT license_type, licensed_cores, available_cores, expires_at
FROM system.license;
```

**In-memory caches** (`system.last_caches`, `system.distinct_caches`) — what Last Value / Distinct Value caches exist and how they're sized. These caches are the one cardinality-sensitive memory consumer in v3 (both Core and Enterprise); a cache on a high-cardinality table can hold large RAM. `system.tables` also carries `last_cache_count` / `distinct_cache_count` per table, a quick way to see which tables carry caches. Triage in `references/cardinality.md`.

```sql
SELECT table, name, key_column_names, value_column_names, count, ttl FROM system.last_caches;
SELECT table, name, column_names, max_cardinality, max_age_seconds FROM system.distinct_caches;
```

Other tables seen in the live catalog and useful here: `system.parquet_files` (persisted-file sizes per table — object-store usage and cardinality, see `references/storage-and-compaction.md` and `references/cardinality.md`), `system.databases`, and `system.tables`.

**PachaTree mode** (Enterprise, when `--use-pacha-tree` is active — detect per `references/storage-format.md`): a family of `system.pt_*` tables is operator-inspectable in place of the Parquet surfaces above. The file inventory is `system.pt_ingest_files` (sizes, row counts, generations) with `system.pt_ingest_wal` for the WAL side; compaction observability moves to `system.pt_compaction_active_jobs` (in-flight plans), `system.pt_compaction_run_sets` (completed run sets per window/level), `system.pt_compaction_nodes` (per-node progress), plus `system.pt_compaction_deferred_snapshots` and `system.pt_compaction_ingest_nodes`. Column shapes and example queries are in `references/storage-and-compaction.md` and the format map in `references/storage-format.md`. **Note:** in PachaTree mode `system.parquet_files` still exists but returns 0 rows — use `system.pt_ingest_files` for the real inventory.
