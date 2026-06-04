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
---

# InfluxDB 3 Operations Skill

<!-- body added in Phase 4 -->
