# AI-Assisted Smoke Evaluation — influxdb3-ops v0.1.0

**Skill:** `influxdb3-ops` v0.1.0
**Plugin version:** v0.6.0
**Date:** 2026-06-03
**Instance:** InfluxDB 3 Enterprise 3.10.0 (live, used for signal-surface confirmation only)
**Method:** AI-assisted (skill content read directly — `SKILL.md`, all 9 files in `references/`, and `examples/diagnose-ops/README.md` — then each ops prompt was answered "as Claude with only the influxdb3-ops skill available," routing through the SKILL.md router and scoring against the smoke-prompt pass criteria. This is **not** a fresh-session plugin load — that remains a manual reviewer step per TESTING.md). Live confirmation: the `/metrics` series and `system.*` queries the skill points operators at were scraped/run against the live Enterprise 3.10.0 instance to confirm they exist and execute. The token was never printed or read.

## Headline

**9/9 ops smoke prompts PASS** (prompts #31–#39). The router in `SKILL.md` §§3–9 sends each symptom to a reference that actually contains the answer; every listed pass criterion is met; the two adversarial/deferral cases (#37 cardinality reality, #39 Cloud Dedicated) behave correctly. No FAIL or PARTIAL.

| # | Prompt (summary) | Routed-to reference | Result | Notes |
|---|---|---|---|---|
| 31 | Core server won't start / exits immediately | `troubleshooting.md` → "Server won't start" (via SKILL §6) | **PASS** | Five-step ordered diagnosis: read startup logs → object-store/`--data-dir` → Enterprise license → port-in-use → bad flag. Token-redaction rule sits above everything. Never inlines a token. |
| 32 | influxdb3 OOM-killed under load | `memory-and-resources.md` → "OOM" (via SKILL §4/§6) | **PASS** | Names `--exec-mem-pool-bytes` (abs bytes or `%`, Enterprise default 20%), the OOM signals (`query_datafusion_query_execution_ooms_total`, `datafusion_mem_pool_bytes`), batch + cardinality contributors. Cites perf-tuning doc via `doc-urls.md`. |
| 33 | Data disk filling up fast | `storage-and-compaction.md` + `examples/diagnose-ops/` (via SKILL §6) | **PASS** | Distinguishes local (WAL + parquet cache + logs) from object-store (persisted Parquet + catalog). Read-only diagnosis first (`system.parquet_files`, `influxdb3_parquet_cache_size_bytes`). NEVER-hand-delete safety note present. |
| 34 | Scrape metrics into Prometheus; which numbers to watch | `observability.md` → "/metrics" (via SKILL §3) | **PASS** | Names `/metrics`, the Bearer-auth gotcha (also `quirks.md` #1 with a Prometheus `authorization`/`bearer_token` scrape-config note), and a verified key-series table grouped by concern. No invented metric names. |
| 35 | 7-day retention set but old data still present | `storage-and-compaction.md` → "Retention enforcement" (via SKILL §6) | **PASS** | Two-stage model: query-time filtering immediate, physical deletion periodic (interval not published). Cross-links `influxdb3` skill (`databases.md`) for retention *configuration*. Matches `quirks.md` #3. |
| 36 | Queries slow on the server — how to triage | `performance.md` → "Slow query triage (server side)" (via SKILL §5) | **PASS** | Ordered checklist: time filter / unbounded `SELECT *` → cardinality → compaction backlog → resource saturation, each tied to a `system.queries` column or `/metrics` histogram. Cites the official performance-tuning doc. Hands client-side triage back to the `influxdb3` skill. |
| 37 | v1.x migration — fears "series cardinality exceeded" | `cardinality.md` → "What cardinality costs in v3" / "Real limits" (via SKILL §5) | **PASS** (adversarial) | Correctly states v3 has **no hard cardinality limit and no such error** (quotes the docs: "infinite tag value and series cardinality"); pivots to the real limits (max databases / tables / columns-per-table) and frames cardinality as memory/query cost, not a rejected write. Does NOT fabricate a v3 cardinality error. Reinforced by `quirks.md` #2 and `troubleshooting.md` "Hitting a hard limit". |
| 38 | One-shot health check to paste into Claude | `examples/diagnose-ops/` (via SKILL §3) | **PASS** | Points at the read-only toolkit; README states it only reads (`/ping`, `/metrics`, read-only `system.*` SELECTs, local `df`/`du`), mutates nothing, and applies a final `apiv3_…` → `<redacted>` net so even a token in an error/`query_text` can't leak. |
| 39 | "I'm on Cloud Dedicated — server keeps falling over" | `SKILL.md` §1/§9 + `troubleshooting.md` → "Cloud deferral" | **PASS** (adversarial / deferral) | Defers: Cloud Serverless/Dedicated are InfluxData-managed, no serve flags/object store/mem pool to operate. Routes to Cloud docs + InfluxData support. Explicitly does NOT walk self-hosted `serve` configuration. |

## What this catches and misses

**Catches:** Router mis-routes, references that don't actually contain the symptom's answer, false assertions (notably a fabricated v3 "series cardinality exceeded" error — #37), missing pass-criterion coverage, invented metric/flag names, token-echo / token-inlining violations, and failed deferrals on the Cloud adversarial.

**Misses (same blind spots as the v0.5.0 plugin gate):** whether the skill **auto-triggers** in a real fresh session (this run reads the content directly), real-terminal UX (clarity, length, follow-up flow), and any failure only reachable by actually executing the diagnostic toolkit end-to-end against a misbehaving node. **A fresh-session plugin-load smoke pass by a human reviewer is still required before tag/release**, per TESTING.md.

## Live confirmation (signal surfaces only)

Confirmed against the live Enterprise 3.10.0 instance (read-only; token never printed):

- **`/metrics` series the skill names all present:** `datafusion_mem_pool_bytes`, `query_datafusion_query_execution_ooms_total`, `jemalloc_memstats_bytes`, `http_requests_total`, `influxdb_iox_query_log_execute_duration_seconds`, `influxdb3_compaction_sequence_number`, `influxdb3_parquet_cache_size_bytes`, `object_store_op_duration_seconds`, `thread_panic_count_total`, `tokio_watchdog_hangs_total`. (`/metrics` Bearer-auth requirement confirmed.)
- **`system.*` queries execute as written:** `system.compaction_events` (2,462 rows), `system.queries` (48 rows), `system.databases` (incl. `retention_period_ns`), `system.tables` (incl. `deleted`/`column_count`/`series_key_columns`), `system.nodes` (node_id/mode/core_count/state), `system.license` (columns valid; values empty on this host — matches the skill's note), `system.generation_durations` (levels 1–6, 600s→432000s — matches `storage-and-compaction.md`).
- **Empty-instance behavior matches the skill's hedging:** `system.parquet_files` and the user-table `system.tables` detection queries return **no rows** on this data-less instance, exactly as the skill warns ("returns no rows — that's expected; the shape is what matters"). No query errored.

## Findings / gaps

None blocking. No PARTIAL or FAIL. Two minor, non-blocking observations for a future patch (do NOT block v0.1.0):

1. **No published `/metrics` monitoring doc URL (already self-documented).** `doc-urls.md` explicitly notes that no dedicated official `/metrics`/Prometheus monitoring page exists yet, so prompt #34's "official doc" anchor is the skill's own verified series table rather than a canonical URL. This is correctly disclosed in the skill and the verified-series table is grounded in a live scrape — not a gap, but worth revisiting to add a row once InfluxData publishes a monitoring page. **No action needed for v0.1.0.**
2. **`system.tables`/`system.parquet_files` detection queries return empty on a data-less node.** The cardinality/disk-inspection queries in `cardinality.md` and `storage-and-compaction.md` can't be exercised for real output on an empty instance. The skill already hedges this ("the shape is what matters"), so it's a test-coverage limitation, not a content bug. A populated-instance manual pass would strengthen #33/#37 confidence. **No action needed for v0.1.0.**

## Summary tally

**9/9 PASS (#31–#39); 0 PARTIAL; 0 FAIL.** Both adversarial/deferral prompts (#37 cardinality reality, #39 Cloud Dedicated) handled correctly. Router → reference coverage is sound; all pass criteria met. Recommend proceeding to the human fresh-session plugin-load smoke pass before tag/release.
