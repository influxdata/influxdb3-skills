# Cardinality — What It Costs in v3, How to Detect and Remediate

The operational and remediation side of high cardinality. Design-time prevention (the tag-vs-field rule) lives in the sibling `influxdb3` skill at `skills/influxdb3/references/schema-design.md` — link there; this file covers what an operator does *after* a high-cardinality schema is already in production.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Both detection queries below ran against `--database _internal` with the exact columns shown. The v3 cardinality framing is quoted from the Core/Enterprise schema-design docs.

## What cardinality costs in v3

InfluxDB 3 is a columnar engine (IOx/Parquet), not the v1/v2 TSM engine. **There is no hard cardinality limit and no `series cardinality exceeded` error in v3.** The InfluxDB 3 docs state plainly:

> "The InfluxDB 3 storage engine supports infinite tag value and series cardinality. Unlike previous versions of InfluxDB, tag value cardinality doesn't affect the overall performance of your database."

Do **not** quote a `series cardinality exceeded` error to a v3 user — that string is a v1/v2 artifact and does not exist here. (The v0.1.0 `influxdb3/references/troubleshooting.md` "Performance hints" still mentions it as a deferred placeholder; this reference supersedes that for v3.)

What high cardinality actually costs in v3 is **schema-shape driven**, not a limit:

- **Wider series keys / wide schemas** → increased resource usage when persisting data during ingestion, and more memory held per table.
- **Complex primary keys (many tags in the series key)** → reduced sort/persist performance, since the primary key is the timestamp plus the full tag set.
- **More distinct series and bigger result sets** → more Parquet data scanned per query, higher per-query memory, slower queries.

So the symptom is **operational, not an error message**: rising process/query memory, slower queries, a large `series_key_columns` set, and growing object-store usage — not a rejected write. See `references/observability.md` for the specific metrics that climb (`datafusion_mem_pool_bytes`, `jemalloc_memstats_bytes`, `influxdb_iox_query_log_max_memory`, `influxdb_iox_query_log_num_rows`, `influxdb_iox_query_log_parquet_files`).

## Real limits that DO exist in v3

The "no hard cardinality limit" framing above is correct — but InfluxDB 3 does enforce three separate hard limits that operators hit in practice. These are **structural** limits (databases, tables, columns), not cardinality (series/tag-value) limits. The numbers differ between Core and Enterprise, and all three are configurable:

| Limit | Core | Enterprise | Config flag (override) |
|---|---|---|---|
| Max databases | 5 | 100 | — |
| Max tables (across **all** databases, not per-DB) | 2,000 | 10,000 | `--num-table-limit` |
| Max columns per table (incl. the required `time` column → 499 combined tag+field) | 500 | 500 | `--num-total-columns-per-table-limit` |

Verified against the official admin docs on 2026-06-03: [Core](https://docs.influxdata.com/influxdb3/core/admin/databases/) and [Enterprise](https://docs.influxdata.com/influxdb3/enterprise/admin/databases/).

**Detection** (run through `_internal` with the CLI invocation shown under "Detect" below):

Database count vs the limit (5 Core / 100 Enterprise):

```sql
SELECT count(*) AS databases FROM system.databases WHERE deleted = false;
```

Total table count vs the limit (2,000 Core / 10,000 Enterprise):

```sql
SELECT count(*) AS tables FROM system.tables WHERE deleted = false;
```

Widest tables vs the 500-column limit:

```sql
SELECT database_name, table_name, column_count
FROM system.tables
WHERE deleted = false
ORDER BY column_count DESC
LIMIT 20;
```

**Remediation when near a limit:** consolidate — merge sparse/redundant tables and retire unused databases to stay under the table/database counts. A table approaching 500 columns is almost always an over-wide schema (one measurement absorbing fields that belong in separate tables, or tags that should be fields); fix the schema shape per `skills/influxdb3/references/schema-design.md` rather than raising the limit. The column-limit flag exists, but a 500-column table is a design smell first.

## The exception: caches are cardinality-sensitive (LVC & DVC)

The "no hard cardinality limit" claim is about the **storage engine** — Parquet/object-store has no cardinality cost. The precise exception is the two **in-memory** caches, the Last Value Cache (LVC) and the Distinct Value Cache (DVC). Both are available in **both Core and Enterprise**, and both grow with the cardinality of the data they cover. If you have created either cache, cardinality has a direct RAM cost there (it feeds the OOM picture in `references/memory-and-resources.md`).

**Last Value Cache (LVC)** caches the last `count` values per series key (subject to `ttl`). Memory scales with (distinct series matching the cache key) × (value columns) × `count` — the docs put it as `key_column_cardinality × count = rows cached`. An LVC on a high-cardinality table or wide key column can consume large RAM. Inspect what exists:

```sql
SELECT table, name, key_column_names, value_column_names, count, ttl FROM system.last_caches;
```

**Distinct Value Cache (DVC)** caches distinct values of one or more columns, **bounded by `max_cardinality`** (and aged out by `max_age_seconds`). `max_cardinality` is the maximum number of distinct value combinations the cache will store and must be set explicitly at creation — there is no implied unbounded default. When the real distinct count exceeds `max_cardinality`, the cache cannot track every value, so DVC-backed lookups can return **incomplete** results. Size `max_cardinality` to the real distinct count of the column(s). Inspect what exists:

```sql
SELECT table, name, column_names, max_cardinality, max_age_seconds FROM system.distinct_caches;
```

`system.tables` also exposes `last_cache_count` and `distinct_cache_count` per table — a quick way to see which tables carry caches at all. Run all of these through `_internal` (CLI invocation under "Detect" below); see `references/observability.md` for these tables in the broader `system.*` context. Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Docs: LVC [Core](https://docs.influxdata.com/influxdb3/core/admin/last-value-cache/) / [Enterprise](https://docs.influxdata.com/influxdb3/enterprise/admin/last-value-cache/); DVC [Core](https://docs.influxdata.com/influxdb3/core/admin/distinct-value-cache/) / [Enterprise](https://docs.influxdata.com/influxdb3/enterprise/admin/distinct-value-cache/).

## Detect

**Widest series keys / most columns** (`system.tables` — `column_count` is `UInt64`, `series_key_columns` is the tag/series-key column set). A long `series_key_columns` list is the direct fingerprint of a high-cardinality tag design:

```sql
SELECT database_name, table_name, column_count, series_key_columns
FROM system.tables
ORDER BY column_count DESC
LIMIT 20;
```

**Biggest tables by rows** — a volume/cardinality proxy; many distinct series produce many rows and bytes. **The file inventory is format-specific** (detect first per `references/storage-format.md`); `system.tables` above is the format-agnostic per-table cardinality view (`column_count`, `series_key_columns`) and is the only per-table breakdown available under PachaTree.

*Parquet mode* — per-table volume from the file inventory:

```sql
SELECT table_name, sum(row_count) AS rows, sum(size_bytes) AS bytes
FROM system.parquet_files
GROUP BY table_name
ORDER BY rows DESC
LIMIT 20;
```

*PachaTree mode* — `system.parquet_files` is empty and `system.pt_ingest_files` has **no `table_name` column**, so volume is only available grouped by `generation` (use `system.tables` above for per-table shape):

```sql
SELECT generation, sum(row_count) AS rows, sum(size_bytes) AS bytes
FROM system.pt_ingest_files
GROUP BY generation
ORDER BY rows DESC;
```

Run these through the `_internal` database:

```bash
INFLUXDB3_AUTH_TOKEN="$INFLUXDB_TOKEN" "$INFLUXDB3_CLI" query --database _internal \
  --host "$INFLUXDB_HOST" "<SQL>"
```

Correlate the table you flag here with the memory/query metrics in `references/observability.md`: a wide-series-key table that also tops `influxdb_iox_query_log_max_memory` or `influxdb_iox_query_log_parquet_files` is the one paying the cost.

## Remediate

The fix is the same as the design rule, applied after the fact: **move the high-cardinality identifier out of the series key (tag) and make it a field.** Identifiers like UUIDs, request/trace IDs, and user/account IDs belong as fields, not tags — see `skills/influxdb3/references/schema-design.md` (the schema authority) for the full tag-vs-field decision table and the offender list.

But you cannot simply re-tag in place. **Schema type-stickiness** means a column's role and type are fixed on first write to a table: a name that was created as a tag stays a tag. Remediation therefore requires one of:

- **A new field name** for the identifier (e.g. `request_id` as a tag → write a new `request_id_val` field instead), or
- **Recreating the table** with the corrected schema and migrating data (`SELECT *` out, rewrite as line protocol).

The stickiness mechanism and the new-name-or-recreate workaround are documented in `skills/influxdb3/references/troubleshooting.md` → "Schema-type stickiness".

## Prevent

Prevention is design-time and lives in the sibling skill — don't re-derive it here:

- `skills/influxdb3/references/schema-design.md` → "The tag-vs-field decision" and "Cardinality — the most common mistake" (when-in-doubt-make-it-a-field; the 50,000-GPU example).

This `influxdb3-ops` skill owns the operational half: detecting an existing high-cardinality table and remediating it on a live instance.
