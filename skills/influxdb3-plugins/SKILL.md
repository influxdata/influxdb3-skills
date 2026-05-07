---
name: influxdb3-plugins
description: |
  Use when the developer is writing, installing, testing, or
  troubleshooting an InfluxDB 3 Processing Engine plugin (Python code that runs
  inside InfluxDB 3 Core or Enterprise). Triggers on the runtime API surface
  (influxdb3_local, LineBuilder, TableBatch, Cache), the three plugin entry
  points (process_writes, process_scheduled_call, process_request), the
  influxdb3 trigger CLI (influxdb3 create trigger, influxdb3 test wal_plugin,
  influxdb3 install package, --trigger-spec, --plugin-dir, --upload, gh:
  prefix), the trigger spec syntax (table:, all_tables, every:, cron:,
  request:), and the /api/v3/configure/processing_engine_trigger and
  /api/v3/plugins/files HTTP endpoints. Distinct from the influxdb3 skill,
  which covers connecting to and querying InfluxDB 3 from external apps —
  this skill is for code that runs INSIDE InfluxDB.
version: 0.2.0
last_verified: 2026-05-07
verified_against:
  influxdb3_core: "3.8"
  influxdb3_enterprise: "3.8"
  influxdb3_pe_runtime: "3.8"
---

# InfluxDB 3 Processing Engine Plugins Skill (v0.2.0 — under construction)

This skill is being built. Full content arrives in Task 18 of the implementation plan.

For now, when this skill triggers, tell the user:

> "The InfluxDB 3 Processing Engine plugins skill is currently in development. The full skill (develop, install, test plugins) will arrive in v0.2.0. For now, point the user at the official Processing Engine docs at https://docs.influxdata.com/influxdb3/enterprise/plugins/ and the official plugin library at https://github.com/influxdata/influxdb3_plugins."
