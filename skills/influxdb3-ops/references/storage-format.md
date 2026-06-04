# Storage Format: Parquet vs PachaTree

InfluxDB 3 has **two on-disk storage formats**, and which one an instance uses changes how you troubleshoot storage, disk, compaction, and cardinality. This file is the canonical detector + per-format surface map; other references cross-link here. For the storage *layers* (WAL → persisted files) and retention/compaction behavior, see `references/storage-and-compaction.md`; for the metrics angle, `references/observability.md`.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03 (running in PachaTree mode). The discriminator query returned `pt_tables = 7`; `system.pt_ingest_files` and `system.pt_compaction_run_sets` executed with the columns below; `system.parquet_files` returned 0 rows.

## Why this matters

- **Parquet** — the established columnar format: `.parquet` files in the object store. Observability lives in `system.parquet_files`, `system.compaction_events`, `system.generation_durations`.
- **PachaTree** — the new Enterprise format: writes `.pt` files sorted by `(ColumnFamilyKey, SeriesKey, Timestamp)`. Observability moves to a family of `system.pt_*` tables.

Who uses which:

| Flavor | Format |
|---|---|
| **Core** | **Always Parquet** — and for the foreseeable future. Core is not getting PachaTree for a while. |
| **Enterprise** | **Parquet today → PachaTree.** PachaTree becomes the **default at 3.10 GA**. On current pre-GA builds it is **opt-in** (Performance Preview beta). Pre-3.10 / current builds without the flag use Parquet. |

Because the system tables and tuning flags differ, **detect the format before reasoning about storage/disk/compaction** — querying the wrong table just returns "table not found" or empty results.

## Detect the format

Run this **first**. It's a two-step check: flavor, then (for Enterprise) the discriminator.

1. **Flavor** — read the `x-influxdb-build` header from `/ping`. `Core` ⇒ **Parquet, done** (no probe needed). `Enterprise` ⇒ run the discriminator below.
2. **Discriminator (Enterprise)** — works against any database (e.g. `_internal`):

```sql
SELECT count(*) AS pt_tables
FROM information_schema.tables
WHERE table_schema = 'system' AND table_name LIKE 'pt_%';
```

| Result | Format |
|---|---|
| `pt_tables > 0` (verified host: `7`) | **PachaTree active** |
| `pt_tables = 0` | **Parquet** |

**Corroborating tell:** in PachaTree mode `system.parquet_files` still exists but returns **0 rows**, and `system.pt_ingest_files` is the populated inventory. In Parquet mode the `pt_*` tables don't exist at all.

## Format → surfaces map

Other references say "see storage-format.md for the per-format table" — this is it. Pick the column matching the detected format.

| Concern | Parquet mode | PachaTree mode |
|---|---|---|
| File / disk inventory | `system.parquet_files` — `table_name, path, size_bytes, row_count, min_time, max_time` (per-table `GROUP BY table_name` works) | `system.pt_ingest_files` — `file_id, file_path, generation, size_bytes, row_count, min_time, max_time, min_file_range_key, max_file_range_key, has_bloom_filter` (**no `table_name` column** — group by `generation` or take totals); plus `system.pt_ingest_wal` (`wal_file_id, file_path, size_bytes, row_count, …, is_merged`) |
| Compaction observability | `system.compaction_events` (`event_time, event_type, event_status, event_duration`); `system.generation_durations` (`level, duration_seconds`) | `system.pt_compaction_active_jobs` (`plan_id, plan_type, state, window, shard_id, target_level, total_slices, completed_slices, created_at`); `system.pt_compaction_run_sets` (`window, window_duration_secs, shard_id, level, run_set_id, created_at, min_key, max_key, min_time, max_time, row_count, file_count, size_mb, …`); `system.pt_compaction_nodes` (`node_id, last_snapshot_sequence, last_file_id, last_compacted_wal_sequence_number`); plus `pt_compaction_deferred_snapshots`, `pt_compaction_ingest_nodes` |
| Compaction metrics | `influxdb3_compaction_sequence_number` | adds `influxdb3_compactor_snapshots_pending`, `influxdb3_compactor_snapshot_poll_duration_seconds` |
| Read cache | `influxdb3_parquet_cache_*` metrics; `--parquet-mem-cache-size` | same `influxdb3_parquet_cache_*` metrics (shared read cache); parquet-cache flags **conflict** with `--use-pacha-tree` — tuning is via beta `--pt-*` flags |

Disk-inventory example, PachaTree mode (no `table_name`, so group by generation):

```sql
SELECT generation, sum(size_bytes) AS bytes, sum(row_count) AS rows
FROM system.pt_ingest_files
GROUP BY generation
ORDER BY bytes DESC;
```

(On an instance with no user data this returns 0 rows — the shape is what matters. The Parquet-mode equivalent grouping by `table_name` lives in `references/storage-and-compaction.md`.)

## PachaTree specifics

- Writes **`.pt` files** sorted by `(ColumnFamilyKey, SeriesKey, Timestamp)` instead of `.parquet`.
- Enabled by **`--use-pacha-tree`** (env `INFLUXDB3_ENTERPRISE_USE_PACHA_TREE`). **Default at 3.10 GA; opt-in Performance Preview beta on current pre-GA builds** — labeled "should not be used in production environments" *yet*.
- **Conflicts with `--parquet-*` flags** (e.g. `--parquet-mem-cache-size`) — can't set both.
- Tuning flags exist under a **`--pt-*`** prefix but are **not listed in `serve --help-all`** (beta/undocumented). Do not invent their names; if an operator needs one, point them to current Enterprise docs.
- **Enterprise-only.** Core stays on Parquet.

## What's identical in both

Most of the skill applies unchanged regardless of format:

- The `/metrics` endpoint (Bearer auth) and the broader observability story.
- `system.queries` (including its `parquet_files` column) for in-flight/recent query inspection.
- `system.last_caches` / `system.distinct_caches` (Last Value Cache / Distinct Value Cache) and their cardinality-driven memory cost — see `references/cardinality.md`.
- The WAL concept and write path, retention enforcement timing (query-time filtering vs periodic physical deletion), and the memory pool model — see `references/storage-and-compaction.md` and `references/memory-and-resources.md`.

For durability/persistence and admin internals, fetch the Durability (Core/Enterprise) and Query-system-data (Core/Enterprise) docs listed in `references/doc-urls.md`. No PachaTree-specific public doc URL is confirmed yet — do not cite one until it's verified live.
