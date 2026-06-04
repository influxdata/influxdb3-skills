# Ops diagnostic toolkit

`diagnose-ops.sh` runs a one-page, **read-only** operator health check on an
InfluxDB 3 instance. Useful when you (or a customer) want a fast snapshot of
server health, capacity, and recent activity before digging deeper or pasting
context into Claude.

It only reads: `GET /ping`, `GET /metrics`, read-only `SELECT` queries against
`system.*` tables, and local `df`/`du`. It never creates, writes, deletes, or
restarts anything on the server.

## What it does

1. `[1] /ping` — reports HTTP status, flavor (`x-influxdb-build`), and version (`x-influxdb-version`).
2. `[2] /metrics health` — scrapes `/metrics` once and surfaces the key operator series (DataFusion mem pool, query OOMs, jemalloc, HTTP/gRPC request counts, compaction sequence, parquet cache size, object-store op durations and transfer bytes, tokio watchdog hangs, thread panics, process start time). The noisy per-bucket histogram lines are dropped; `_sum`/`_count` summaries are kept. A 401 prints a "metrics need a valid admin token" note.
3. `[3] Local disk` — if `INFLUXDB_DATA_DIR` is set and exists (file object store only), runs `du -sh` on it and `df -h` of its mount; otherwise prints "skipped".
4. `[4] Logs` — a process can't portably read another process's logs, so it prints the per-deployment command to fetch them (Docker, systemd, foreground).
5. `[5] Node & license` — `system.nodes` (node_id, mode, core_count, state) and `system.license` (license_type, licensed_cores, available_cores, expires_at).
6. `[6] Recent compaction` — last 10 rows of `system.compaction_events`.
7. `[7] Slowest recent queries` — top 10 completed queries from `system.queries` by `end2end_duration`.
8. `[8] Biggest tables` — top 15 tables by total parquet size from `system.parquet_files`.

Each `system.*` query tolerates failure (permission or edition differences) and
prints a short "skipped/failed: <reason>" instead of aborting the run.

This script is **read-only and token-safe**: it never prints your token, and a
final redaction net replaces any `apiv3_…` token with `<redacted>` on all
output — so even a token that appears in an error or a `query_text` can't leak.

## Run it

```bash
cp .env.example .env   # then edit: set INFLUXDB_HOST and INFLUXDB_TOKEN
bash diagnose-ops.sh
```

Optional `.env` settings: `INFLUXDB_DATABASE` (defaults to `_internal`),
`INFLUXDB_DATA_DIR` (for local-disk stats), and `INFLUXDB3_CLI` (absolute path
to the `influxdb3` binary if it's not on your `PATH`). The script also reads
these straight from the environment if no `.env` is present.

## Output

```
InfluxDB 3 ops diagnostic — read-only health report
==================================================
host:     http://localhost:8181
database: _internal

[1] /ping
    status:  200
    flavor:  Enterprise
    version: 3.10.0-oss-nightly

[2] /metrics health (key operator series)
    datafusion_mem_pool_bytes{state="limit"} 7730941133
    query_datafusion_query_execution_ooms_total 0
    influxdb3_parquet_cache_size_bytes 0
    tokio_watchdog_hangs_total{runtime="datafusion"} 0
    thread_panic_count_total{type="unknown"} 0
    ...

[3] Local disk
    skipped (set INFLUXDB_DATA_DIR to a local file-object-store data dir)

[4] Logs (cannot read another process's logs portably — fetch them with):
    Docker:     docker logs <container>
    systemd:    journalctl -u influxdb3 -n 200 --no-pager
    foreground: the process stdout/stderr where you launched influxdb3

[5] Node & license
  system.nodes:
  +---------------------------------+-------+------------+---------+
  | node_id                         | mode  | core_count | state   |
  +---------------------------------+-------+------------+---------+
  | host-node                       | [all] | 18         | running |
  +---------------------------------+-------+------------+---------+
  ...

[6] Recent compaction (system.compaction_events)
  ...

[7] Slowest recent queries (system.queries)
  ...

[8] Biggest tables (system.parquet_files)
  ...

Done. (read-only)
```
