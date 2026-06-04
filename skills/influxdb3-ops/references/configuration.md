# Server Configuration — Startup, Object Store, Memory

Server-side `influxdb3 serve` configuration for self-hosted Core and Enterprise. For the bootstrap walkthrough (tokens, first database) see `skills/influxdb3/references/connecting.md`; for install + license activation see `skills/influxdb3/references/installing.md`. For the curated doc URLs used below, see `references/doc-urls.md`.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03 via `influxdb3 serve --help` / `--help-all`. Core-only details are sourced from the Core config-options doc and marked **(Core docs)**.

## Config precedence

**CLI flags override `INFLUXDB3_*` environment variables.** When the same setting is supplied both ways, the command-line flag wins. The config-options doc states it as: CLI flags take precedence over environment variables.

Two scopes exist: a few **global options** precede the subcommand (e.g. `influxdb3 --<global> serve ...`), while the **serve options** below follow `serve`. When in doubt, run `influxdb3 serve --help` (top-level flags) or `--help-all` (every flag) and read the `[env: ...]` annotation on each line — that is the authoritative env-var name.

## Startup essentials

| Purpose | Flag | Env var | Notes |
|---|---|---|---|
| Node identifier | `--node-id <ID>` | `INFLUXDB3_NODE_IDENTIFIER_PREFIX` | Required. Prefixes object-store file paths. `--node-id-from-env <VARNAME>` reads it indirectly. |
| Object store type | `--object-store <TYPE>` | `INFLUXDB3_OBJECT_STORE` | Required. `memory`, `memory-throttled`, `file`, `s3`, `google`, `azure`. Defaults to `memory` if omitted. |
| Local data dir | `--data-dir <DIR>` | `INFLUXDB3_DB_DIR` | Required when `--object-store file`. |
| HTTP bind address | `--http-bind <ADDR>` | `INFLUXDB3_HTTP_BIND_ADDR` | Default `0.0.0.0:8181`. |

**Enterprise also requires `--cluster-id <ID>`** (`INFLUXDB3_ENTERPRISE_CLUSTER_ID`) — it prefixes the Enterprise catalog location in the object store — and a **license on first boot**. Pass `--license-email <EMAIL>` (`INFLUXDB3_ENTERPRISE_LICENSE_EMAIL`) + `--license-type <home|trial|commercial>` (`INFLUXDB3_ENTERPRISE_LICENSE_TYPE`), or `--license-file <PATH>` (which makes the other two ignored). A license-less non-interactive start fails fast — see `skills/influxdb3/references/installing.md` → "Enterprise license activation" for the full flow.

Minimum Enterprise local start (verified):

```bash
influxdb3 serve --cluster-id cluster0 --node-id node1 \
  --object-store file --data-dir ~/.influxdb_data \
  --license-email you@example.com --license-type home
```

Core omits `--cluster-id` and the `--license-*` flags **(Core docs)** — Core is single-node and unlicensed.

## Object-store config

`--object-store` selects where the catalog and Parquet data live. Required option set and the failure mode if you get it wrong:

| Backend | Required with it | What breaks if wrong |
|---|---|---|
| `file` | `--data-dir <DIR>` | Missing/unwritable dir → server won't start or can't persist; data and (Enterprise) license aren't cached. |
| `memory` | none | All data lives in RAM — grows unbounded under sustained writes and is lost on restart; Enterprise license can't cache. |
| `s3` | `--bucket`, `--aws-access-key-id`, `--aws-secret-access-key` (region via `--aws-default-region`, default `us-east-1`) | Bad bucket/region/credentials → startup or first-persist failure (403/404 from S3); catalog can't load. |
| `google` | `--bucket`, `--google-service-account <PATH>` | Missing/invalid service-account JSON → auth failure reaching the bucket. |
| `azure` | `--bucket`, `--azure-storage-account` (key via `--azure-storage-access-key`; omit to use Workload/Managed Identity) | Wrong account or missing key without identity configured → can't authenticate to blob storage. |

Cloud credential flags map to provider-standard env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `GOOGLE_SERVICE_ACCOUNT`, `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_ACCESS_KEY`), not `INFLUXDB3_*`.

## Storage format

The object store holds persisted data in one of **two on-disk formats**, and the choice changes which tuning flags and system tables apply (full detector + surface map in `references/storage-format.md`):

- **Core is Parquet only** — `.parquet` files, for the foreseeable future.
- **Enterprise** runs **Parquet today** and moves to **PachaTree** (`.pt` files), which becomes the **default at 3.10 GA**. On current pre-GA builds PachaTree is **opt-in** (Performance Preview beta — not for production yet), enabled with `--use-pacha-tree` (env `INFLUXDB3_ENTERPRISE_USE_PACHA_TREE`).

`--use-pacha-tree` **conflicts with the `--parquet-*` flags** — you can't set both. PachaTree has its own tuning under a `--pt-*` prefix, but those flags are **beta/undocumented** (not listed in `serve --help-all`); don't invent their names — point operators at current Enterprise docs.

**Parquet read-cache flags** (Parquet mode; verified present in `serve --help-all`) — these tune the in-memory read cache that fronts persisted files. In PachaTree mode they conflict with `--use-pacha-tree` and don't apply:

| Flag | Default | Purpose |
|---|---|---|
| `--parquet-mem-cache-size <SIZE>` | `20%` | In-memory Parquet read-cache size (absolute bytes or percentage of host RAM). Drives `influxdb3_parquet_cache_size_bytes`. |
| `--parquet-mem-cache-prune-percentage <PCT>` | `0.1` | Fraction pruned from the cache on each prune cycle. |
| `--parquet-mem-cache-prune-interval <INTERVAL>` | `1s` | How often the cache prune check runs. |
| `--parquet-mem-cache-query-path-duration <DURATION>` | `3d` | Time window over which query-path caching is considered. |
| `--disable-parquet-mem-cache` | off | Turns the in-memory Parquet read cache off entirely. |

The `influxdb3_parquet_cache_*` metrics that report on this cache persist in **both** formats (it's the shared read cache); see `references/observability.md`.

## Memory

The query-execution memory pool is set with `--exec-mem-pool-bytes <SIZE>` (`INFLUXDB3_EXEC_MEM_POOL_BYTES`). It accepts either an **absolute byte value** or a **percentage of total available memory** — e.g. `8000000000` or `10%`. The Enterprise default is `20%`. (On the verified host, `datafusion_mem_pool_bytes{state="limit"}` reported ~7.73 GB, consistent with ~20% of that host's total RAM.)

If queries fail with resource-exhausted / memory-pool errors, this is the knob to raise (within the host's RAM budget). For broader query-memory tuning, fetch the performance-tuning doc from `references/doc-urls.md`.

## Env-var equivalents

Every serve flag has an `INFLUXDB3_*` equivalent shown in its `[env: ...]` annotation in `--help` / `--help-all`. The pattern: uppercase the setting and replace hyphens with underscores, prefixed `INFLUXDB3_` — though some names differ from the literal flag (e.g. `--node-id` → `INFLUXDB3_NODE_IDENTIFIER_PREFIX`, `--data-dir` → `INFLUXDB3_DB_DIR`), so always trust the `[env: ...]` annotation over the pattern. Cloud-credential flags are the exception (provider-standard names, above). For the full enumerated list, fetch the Core or Enterprise config-options doc from `references/doc-urls.md` rather than re-listing every variable here.
