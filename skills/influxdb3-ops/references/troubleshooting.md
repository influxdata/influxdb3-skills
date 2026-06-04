# Ops Troubleshooting Router — Self-Hosted Server

When a self-hosted Core/Enterprise server is misbehaving. Symptom-keyed at the top; topic sections below route into the operational references. For client-facing symptoms (auth, line-protocol, query results) this defers to the `influxdb3` skill; for plugin-runtime symptoms, to the `influxdb3-plugins` skill — see [Cross-skill routes](#cross-skill-routes).

## Token redaction rule

**If the customer pastes a real-looking token in their error message or logs (regex `apiv3_[A-Za-z0-9_-]{30,}`):**

1. Acknowledge the leak: *"Your error includes a real-looking token. Treat it as compromised — revoke and rotate immediately before continuing."*
2. Point at the rotation pattern in `references/tokens.md` → "Token rotation pattern".
3. **Never echo any portion of the token** in any response. Not the full string. Not the first 8 characters. Not the last 4. Not an `apiv3_…` truncation. Refer to it only as "the token in your error" or `<redacted>`. The bare `apiv3_` prefix alone is fine for explanation; anything after it is off-limits.
4. Then, with the token redacted, proceed to diagnose the underlying error.

**Why this matters:** even a token prefix is a fingerprint that helps an attacker correlate logs. The fact that the customer already pasted it doesn't lower the bar — quoting it back persists the leak in another place.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Core specifics noted where they differ.

## Start here

Before diagnosing anything, run the read-only diagnostic toolkit `examples/diagnose-ops/` and read the signals it collects (logs, `/metrics`, `system.*` tables) — see `references/observability.md` for how to interpret them. Most of the sections below assume you've already captured that snapshot.

## Symptom → section

| Symptom | Section |
|---|---|
| `influxdb3 serve` exits immediately / won't come up | [Server won't start](#server-wont-start) |
| `Address already in use` / port bind failure | [Server won't start](#server-wont-start) |
| `unknown flag` / bad option at startup | [Server won't start](#server-wont-start) |
| Enterprise start fails with a license error | [Server won't start](#server-wont-start) |
| Object-store connect / permission / region errors | [Object-store errors](#object-store-errors) |
| Process OS-killed, or queries failing with OOM | [Out of memory / OOM](#out-of-memory--oom) |
| Local disk filling up | [Disk filling up](#disk-filling-up) |
| Retention "not enforcing" / expired data still present | [Compaction backlog / retention not enforcing](#compaction-backlog--retention-not-enforcing) |
| Many tiny Parquet files / historical queries slowing | [Compaction backlog / retention not enforcing](#compaction-backlog--retention-not-enforcing) |
| Queries/writes slow server-wide | [Slow at the server level](#slow-at-the-server-level) |
| `too many databases/tables/columns` rejection | [Hitting a hard limit](#hitting-a-hard-limit) |
| User expects a `series cardinality exceeded` error | [Hitting a hard limit](#hitting-a-hard-limit) |
| Cloud Serverless / Cloud Dedicated issue | [Cloud deferral](#cloud-deferral) |
| 401/403, line-protocol 400, query returns 0 rows | [Cross-skill routes](#cross-skill-routes) |
| Plugin trigger doesn't fire / plugin ImportError | [Cross-skill routes](#cross-skill-routes) |

## Server won't start

**What you'll see:** `influxdb3 serve` exits within a second or two and the process doesn't stay up; the cause is almost always in the first/last lines of startup output.

**Diagnose (in order):**

1. **Read the startup logs.** They name the failure directly. See `references/observability.md` → "Server logs" for capturing them (`--log-filter`, `--log-format`, `--log-destination`). Match the message to one of the cases below.
2. **Object-store / `--data-dir` misconfig.** For `--object-store file`, a missing or unwritable `--data-dir` means the server can't persist (and Enterprise can't cache its license) — it won't start or won't stay up. Check the object-store option set in `references/configuration.md` → "Object-store config".
3. **Missing/invalid Enterprise license.** A license-less non-interactive Enterprise start fails fast. Confirm `--cluster-id` plus the `--license-email`/`--license-type` (or `--license-file`) flags per `references/configuration.md` → "Startup essentials". (Core is unlicensed and omits these.)
4. **Port already in use.** `Address already in use` means another process (often a stale `influxdb3`) holds the HTTP bind address. Find it (`lsof -i :8181`) and stop it, or move the server with `--http-bind`.
5. **Unknown / bad flag.** `unknown flag` or a parse error means a typo or a flag from the wrong edition. Cross-check against `references/configuration.md` → "Startup essentials" and "Env-var equivalents".

**Fix:** correct the offending flag/path/license and restart. Object-store and license details live in `references/configuration.md`.

## Object-store errors

**What you'll see:** at startup, the server can't reach or authenticate to the backing store; at runtime, an already-running node logs persist/compaction failures and the local WAL backlog grows.

**Diagnose (in order):**

1. **Connectivity.** Can the host reach the endpoint at all? Transient connectivity or throttling shows up at runtime as persisting/compaction failures — see `references/storage-and-compaction.md` → "Object-store errors".
2. **Permissions.** A credential or bucket-policy change on a running node surfaces as write/persist failures, not a restart. Confirm the object-store credentials and access from `references/configuration.md` → "Object-store config".
3. **Wrong region / bucket / prefix.** A mismatched region or bucket name fails at startup or on first persist. Verify the option set in `references/configuration.md` → "Object-store config"; for Enterprise, remember `--cluster-id` prefixes the catalog location.

**Fix:** correct the endpoint/region/bucket/credentials per `references/configuration.md`; for runtime failure modes and how to confirm them via `system.compaction_events` and the `object_store_*` metrics, see `references/storage-and-compaction.md` → "Object-store errors".

## Out of memory / OOM

**What you'll see:** the process gets OS-killed, or queries fail with an OOM/resources-exhausted error while the process survives.

**Diagnose (in order):**

1. **Scrape the OOM signals** (`/metrics` requires Bearer auth — see `references/observability.md`): `query_datafusion_query_execution_ooms_total` and `datafusion_mem_pool_bytes`. A rising `ooms_total` with `{state="reserved"}` near `{state="limit"}` = queries are hitting the pool ceiling. A process OS-killed with the counter flat = the pool is sized larger than RAM supports, or non-query memory (writes/cache).
2. **Identify the heavy queries** via `system.queries` and follow the rest of `references/memory-and-resources.md` → "OOM (out of memory)".

**Fix:** size `--exec-mem-pool-bytes` for the host — full guidance (and the disk/cache interplay) in `references/memory-and-resources.md`.

## Disk filling up

**What you'll see:** local disk climbing toward full, or object-store usage growing.

**Diagnose (in order):**

1. **Local disk vs. object store.** Local disk holds the WAL, the Parquet cache (`influxdb3_parquet_cache_size_bytes`), and logs; the object store holds persisted Parquet, the catalog, and the WAL copy. Unbounded *local* growth is usually the cache or log volume, not raw data — see `references/memory-and-resources.md` → "Disk pressure".
2. **Inspect actual usage.** Query `system.parquet_files` per table for persisted footprint and scrape the cache-size metric, both shown in `references/storage-and-compaction.md` → "Disk / storage inspection".

**Fix:** lower `--parquet-mem-cache-size`, rotate logs, or let retention/compaction reclaim object-store space. **NEVER hand-delete WAL or Parquet files** — it causes data loss and catalog corruption; see the safety note in `references/memory-and-resources.md` → "Disk pressure".

## Compaction backlog / retention not enforcing

**What you'll see:** expired data is still present after its retention window, and/or many tiny Parquet files accumulate while historical-range queries slow down.

**Diagnose (in order):**

1. **"Retention not enforcing" is usually expected timing.** Retention is enforced on a schedule, **not instantly** — physical deletion is periodic and the docs don't publish an exact interval. Expired data persisting until the next sweep is normal. Full explanation in `references/storage-and-compaction.md` → "Retention enforcement".
2. **Confirm a real compaction backlog** via `system.compaction_events` (look for `event_status` ≠ `success`) per `references/storage-and-compaction.md` → "Compaction". Small files piling up with stalled/erroring events is the backlog signature.

**Fix:** for genuine timing, wait for the next sweep; for a backlog tied to object-store errors, resolve those first. See `references/storage-and-compaction.md` → "Compaction" and "Retention enforcement".

## Slow at the server level

**What you'll see:** queries or writes are slow across the board, not a single client's bad query.

**Diagnose (in order):**

1. **Has the client-side triage been tried?** Add a time filter, add `LIMIT`, batch writes — that's owned by the `influxdb3` skill (`skills/influxdb3/references/troubleshooting.md` → "Performance hints"). If not yet tried, send them there first.
2. **Server-side analysis** via `system.queries` (durations, `parquet_files`, `partitions`, `max_memory`) and the query-engine `/metrics` histograms — see `references/performance.md` → "Slow query triage (server side)" and "Slow write triage". A high `parquet_files` count points back at a compaction backlog (above).

**Fix:** documented tuning knobs are in `references/performance.md`; memory-pool/cache thresholds are in `references/memory-and-resources.md`.

## Hitting a hard limit

**What you'll see:** a write or DDL operation is rejected for exceeding a *structural* limit — too many databases, too many tables, or too many columns.

**Important — there is NO `series cardinality exceeded` error in v3.** That string is a v1/v2 (TSM) artifact. The InfluxDB 3 columnar engine supports effectively unlimited tag-value and series cardinality; high cardinality is an *operational cost* (memory, scan, query latency), never a rejected write. If a user coming from v1/v2 expects that error, correct the expectation and route to the real limits.

**Diagnose:** the real hard limits are max **databases**, **tables**, and **columns** (numbers differ between Core and Enterprise, and all three are configurable). See `references/cardinality.md` → "Real limits that DO exist in v3" to map the rejection to the specific limit, and "What cardinality costs in v3" for the operational-cost framing.

**Fix:** raise the relevant configurable limit, or restructure schema (fewer tables/columns). For the high-cardinality *performance* angle (detect/remediate/prevent), see `references/cardinality.md`.

## Cloud deferral

Cloud Serverless and Cloud Dedicated are InfluxData-managed — you don't control the serve flags, object store, memory pool, or disk on those. Do **not** walk a Cloud customer through self-hosted `influxdb3 serve` configuration. Route them to the Cloud documentation and InfluxData support for their plan.

## Cross-skill routes

This router covers the self-hosted *server*. Other symptom classes live in sibling skills:

- **Client-facing symptoms** — HTTP 401/403, line-protocol 400 parse errors, query-returns-0-rows / wrong rows → the `influxdb3` skill: `skills/influxdb3/references/troubleshooting.md`.
- **Plugin-runtime symptoms** — a trigger doesn't fire, a plugin `ImportError`, processing-engine errors → the `influxdb3-plugins` skill: `skills/influxdb3-plugins/references/troubleshooting.md`.
