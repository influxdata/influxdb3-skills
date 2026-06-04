# Curated Documentation URLs (Ops)

When the skill content does not cover an operator's question — or when the answer might be version-sensitive — Claude is allowed to WebFetch from this list. **Do not invent URLs that aren't on this list.** If you need a doc that's not here, ask the operator for the URL or note that the answer requires fresh research.

## Configuration & CLI

| Topic | URL | When to fetch |
|---|---|---|
| Config options (Core) | https://docs.influxdata.com/influxdb3/core/reference/config-options/ | Full list of server config flags / env vars for self-hosted single-node Core |
| Config options (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/config-options/ | Server config flags / env vars specific to Enterprise (clustering, licensing) |
| `influxdb3 serve` CLI (Core) | https://docs.influxdata.com/influxdb3/core/reference/cli/influxdb3/serve/ | Exact flags and defaults for starting the Core server |
| `influxdb3 serve` CLI (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/serve/ | Exact flags and defaults for starting an Enterprise node |
| `influxdb3` CLI index (Core) | https://docs.influxdata.com/influxdb3/core/reference/cli/influxdb3/ | Discover subcommands (create, show, query, backup, etc.) for Core |
| `influxdb3` CLI index (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/ | Discover subcommands for Enterprise |

## Operations / admin (monitoring, metrics, logs, retention, compaction, performance)

> No dedicated `/metrics` (Prometheus) monitoring page is published in the current docs. Add a monitoring/metrics page row here once a confirmed official URL exists. In the meantime, usage telemetry and durability/data-retention internals below are the closest official references.

| Topic | URL | When to fetch |
|---|---|---|
| Performance tuning (Core) | https://docs.influxdata.com/influxdb3/core/admin/performance-tuning/ | Tuning queries, memory, and write/compaction behavior on Core |
| Performance tuning (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/performance-tuning/ | Tuning queries, memory, and write/compaction behavior on Enterprise |
| Data retention internals (Core) | https://docs.influxdata.com/influxdb3/core/reference/internals/data-retention/ | How retention periods are enforced (query-time enforcement, deletion) on Core |
| Data retention internals (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/internals/data-retention/ | How retention periods are enforced on Enterprise |
| Durability internals (Core) | https://docs.influxdata.com/influxdb3/core/reference/internals/durability/ | Write path, WAL, Parquet persistence, and compaction behavior on Core |
| Durability internals (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/internals/durability/ | Write path, persistence, and compaction behavior on Enterprise |
| Manage databases (Core) | https://docs.influxdata.com/influxdb3/core/admin/databases/ | Create/list/delete databases and set retention periods on Core |
| Manage databases (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/databases/ | Create/list/delete databases and set retention periods on Enterprise |
| Query system data (Core) | https://docs.influxdata.com/influxdb3/core/admin/query-system-data/ | Inspect internal system tables for diagnostics on Core |
| Query system data (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/query-system-data/ | Inspect internal system tables for diagnostics on Enterprise |
| Back up and restore (Core) | https://docs.influxdata.com/influxdb3/core/admin/backup-restore/ | Backup/restore procedures and flags on Core |
| Back up and restore (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/backup-restore/ | Backup/restore procedures and flags on Enterprise |
| File indexes (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/file-index/ | Manage file indexes to tune query performance (Enterprise-only) |
| Usage telemetry (Core) | https://docs.influxdata.com/influxdb3/core/reference/telemetry/ | What telemetry is collected and how to opt out (`--disable-telemetry-upload`) on Core |
| Usage telemetry (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/reference/telemetry/ | What telemetry is collected and how to opt out on Enterprise |
| Last Value Cache (Core) | https://docs.influxdata.com/influxdb3/core/admin/last-value-cache/ | LVC behavior, `count`/`ttl`, and its cardinality-driven memory cost on Core |
| Last Value Cache (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/last-value-cache/ | LVC behavior and memory cost on Enterprise |
| Distinct Value Cache (Core) | https://docs.influxdata.com/influxdb3/core/admin/distinct-value-cache/ | DVC `max_cardinality`/`max_age_seconds` bounds and incomplete-result behavior on Core |
| Distinct Value Cache (Enterprise) | https://docs.influxdata.com/influxdb3/enterprise/admin/distinct-value-cache/ | DVC bounds and behavior on Enterprise |

## Per-flavor landing pages

| Flavor | URL | When to fetch |
|---|---|---|
| Core | https://docs.influxdata.com/influxdb3/core/ | Default for self-hosted single-node setups; entry point for Core ops topics |
| Enterprise | https://docs.influxdata.com/influxdb3/enterprise/ | Multi-node, clustering, replication; entry point for Enterprise ops topics |

## Last verified

This URL list was last verified on **2026-06-03**. If you find a broken link, log it in `evals/results/` and update this file as part of the next quarterly refresh.
