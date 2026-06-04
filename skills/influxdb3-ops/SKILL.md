---
name: influxdb3-ops
description: |
  Use when operating, running, or keeping healthy a self-hosted InfluxDB 3
  Core or Enterprise server — as opposed to writing app code against it.
  Triggers on server-lifecycle problems (server won't start, influxdb3 serve
  exits immediately, license-prompt failures, object-store or --data-dir
  startup errors), resource pressure (out of memory / OOM-killed, disk
  filling up, WAL growing unbounded, high memory usage), storage behavior
  (compaction backlog, retention not being enforced, object-store
  connectivity errors), observability surfaces (the /metrics Prometheus
  endpoint, scraping InfluxDB 3 metrics, reading server logs, operator-facing
  system.* tables), server-level performance (slow queries or writes
  attributed to the server, high-cardinality memory/query cost, hitting the
  database / table / column-count limits), and configuration surfaces
  (influxdb3 serve flags, INFLUXDB3_*
  environment variables, object-store configuration, memory pool sizing).
  Distinct from the influxdb3 skill (connecting to, reading from, writing to,
  or administering the DB from an external app) and the influxdb3-plugins
  skill (Python code that runs inside the Processing Engine) — this skill is
  for operating and running the InfluxDB 3 server process itself on
  self-hosted Core/Enterprise. Cloud Serverless and Cloud Dedicated are
  InfluxData-managed; for those, this skill defers to the Cloud docs.
version: 0.1.0
last_verified: "2026-06-03"
verified_against:
  influxdb3_core: "3.10"
  influxdb3_enterprise: "3.10"
  storage_formats: ["parquet", "pachatree"]
---

# InfluxDB 3 Operations Skill

## 1. What this skill is for

This skill teaches Claude to **operate and keep running a self-hosted InfluxDB 3 Core or Enterprise server** — the operator / SRE persona. It covers the server *process*: starting it, reading its signals, keeping it healthy under resource pressure, and diagnosing storage, performance, and configuration problems.

It is **not** for writing app code against InfluxDB, and not for code that runs inside the engine:
- **Connecting, writing, querying, schema design, and admin (tokens / databases)** → sibling skill `influxdb3` (the external-app/admin persona).
- **Python code that runs inside the Processing Engine** (`process_writes`, scheduled/request triggers) → sibling skill `influxdb3-plugins`.

**Cloud Serverless and Cloud Dedicated are InfluxData-managed** — there is no server for you to operate. For those, defer politely and point at the Cloud docs (see §8 and `references/doc-urls.md`). This skill targets **self-hosted Core/Enterprise** only.

## 2. Identify what you're operating

Capture **flavor + version** before diagnosing — references and config flags differ by edition.

1. `GET <host>/ping` and read the headers: `x-influxdb-build` (`Core` / `Enterprise`) and `x-influxdb-version` (e.g. `3.10`).
2. Note both in your working context; quote the exact version when routing to docs.
3. **Detect the storage format** — it changes how you read storage/disk/compaction/cardinality signals. **Core** uses Parquet. **Enterprise** uses Parquet today but defaults to **PachaTree** at 3.10 GA (opt-in now via `--use-pacha-tree`). Detect with: `SELECT count(*) FROM information_schema.tables WHERE table_schema='system' AND table_name LIKE 'pt_%'` — `>0` means PachaTree. Full method and the per-format surface map: `references/storage-format.md`.

For full flavor-detection logic (Cloud probes, ambiguous cases), cross-link the sibling skill — do not duplicate it: `skills/influxdb3/references/flavor-detection.md`.

## 3. Start here: read the signals (observability-first)

Diagnose from evidence, not guesses. Before reasoning about any symptom, sample the server's signals.

- **Run the read-only diagnostic toolkit:** `examples/diagnose-ops/` produces a one-page, token-safe health report (logs summary, `/metrics`, `system.*`). It mutates nothing. Run it first when the symptom is unclear, and have the operator paste the report.
- **Then read** `references/observability.md` — the three signal sources: **logs** (`--log-filter` / `--log-format` / `--log-destination`), **`/metrics`** (Prometheus; needs `Authorization: Bearer` auth), and **`system.*` tables** (queries, compaction, license).

Most investigations begin by looking at all three. The topic references below all assume you've already sampled the signals.

## 4. Run & keep running

**Rules:**
- **Enterprise needs a license** — a bare `serve` with no TTY fails fast on the email prompt; pass `--license-email` + `--license-type`. (Bootstrap detail lives in `skills/influxdb3/references/installing.md`.)
- **Pick the object store deliberately.** `file` needs `--data-dir`; `memory` is RAM-only and unsafe for sustained writes or restarts; S3/GCS/Azure need their own credentials.
- **The memory pool defaults to ~20% of system RAM** (`--exec-mem-pool-bytes`). Undersized pools kill queries; oversized pools risk OOM. Size it against the box.

| Goal | Read |
|---|---|
| `influxdb3 serve` flags, `INFLUXDB3_*` env vars, object-store + license config, mem-pool sizing | `references/configuration.md` |
| Durability (WAL→Parquet), retention enforcement, compaction, object-store errors, disk usage | `references/storage-and-compaction.md` |
| Which storage format am I on (Parquet vs PachaTree) and how signals differ | `references/storage-format.md` |
| OOM, disk pressure, sizing the box | `references/memory-and-resources.md` |

## 5. Performance & cardinality

**Rules:**
- **v3 has no hard cardinality limit.** There is no "series cardinality exceeded" error — do not assert one. The real ceilings are **max databases / tables / columns**. High cardinality costs memory and query time, but it isn't a hard cap.
- **Handoff:** the `influxdb3` skill owns *client-side quick triage* (add a time filter, add a `LIMIT`, batch writes). This skill owns *server-side depth* — attributing slowness to the server via `system.queries` and the metrics.

| Goal | Read |
|---|---|
| Server-side slow query / slow write triage (`system.queries`) | `references/performance.md` |
| What high cardinality costs, how to detect and remediate it; the real max DB/table/column limits | `references/cardinality.md` |

Design-time prevention (tag-vs-field) lives in the sibling skill: `skills/influxdb3/references/schema-design.md`.

## 6. Troubleshooting

When a self-hosted server is misbehaving, route by symptom into `references/troubleshooting.md` (symptom-keyed at the top, with a token-redaction rule before anything else).

| Symptom | Read |
|---|---|
| Server won't start / `serve` exits immediately / license-prompt failure | `references/troubleshooting.md` → server startup |
| Object-store error (connectivity, credentials, `--data-dir`) | `references/troubleshooting.md` → object store |
| Out of memory / OOM-killed | `references/troubleshooting.md` → OOM (and `references/memory-and-resources.md`) |
| Disk filling up / WAL growing | `references/troubleshooting.md` → disk (and `references/storage-and-compaction.md`) |
| Compaction backlog / retention not enforced | `references/troubleshooting.md` → compaction & retention |
| Slow at the server (queries/writes) | `references/troubleshooting.md` → performance (and `references/performance.md`) |
| Hitting a hard limit (max databases / tables / columns) | `references/troubleshooting.md` → limits (and `references/cardinality.md`) |

For client-facing symptoms (auth, line protocol, query results) defer to the `influxdb3` skill; for plugin-runtime symptoms, to `influxdb3-plugins`.

## 7. Quirks

"This behaves weirdly but the docs don't say why" — the ops-focused catalogue of non-obvious operator behaviors, each as *What you'll see → Why → What to do*: `references/quirks.md`.

## 8. When in doubt, fetch fresh docs

If a question lands outside what's baked in — or the answer is version-sensitive — WebFetch from a curated URL in `references/doc-urls.md`. **Never invent URLs.** If the doc you need isn't on the list, ask the operator for it or note that it needs fresh research.

## 9. What this skill does NOT cover (v0.1.0)

These are on the roadmap. If asked, defer politely and point at the relevant docs:

- **Enterprise fleet ops** — multi-node cluster placement, replication, RBAC.
- **Backup / restore.**
- **Air-gapped operation.**
- **PachaTree deep tuning** — the skill detects the format and adapts storage/compaction guidance, but the beta `--pt-*` tuning flags are an undocumented surface not yet covered per-flag; await GA docs.

Sample deferral:

> "This skill (v0.1.0) covers operating a single self-hosted Core/Enterprise node — startup, signals, storage, performance, and troubleshooting. <Topic> isn't covered yet (it's on the roadmap). For now, the Enterprise ops docs are the best resource: https://docs.influxdata.com/influxdb3/enterprise/ — and for the exact procedure, see the relevant URL in `references/doc-urls.md`."

For Cloud Serverless / Cloud Dedicated, there is no node to operate — defer to the Cloud docs via `references/doc-urls.md`.
