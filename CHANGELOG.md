# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-05-07

### Added
- New skill `influxdb3-plugins` covering Processing Engine plugin development, installation, and testing (single-node).
- All three trigger types: WAL/data-write (`process_writes`), scheduled (`process_scheduled_call`), HTTP request (`process_request`).
- Full runtime API reference (`influxdb3_local`, `LineBuilder`, `Cache`, `table_batches` dict shape).
- Five runnable plugin examples — `wal/`, `scheduled/`, `request/`, `cache_counter/`, `multifile_alert/` — verified end-to-end against a live Enterprise 3.8.4 instance.
- `references/installing.md` covering `--upload`, `PUT /api/v3/plugins/files`, `gh:` prefix, custom plugin repos, and the security model (admin-token-only operations, path traversal protection).
- `references/dependencies.md` covering `influxdb3 install package` and the embedded venv rule (never `python -m venv` against system Python).
- `references/testing.md` covering `influxdb3 test wal_plugin` / `test schedule_plugin` offline simulation, the live-trigger iteration loop, and `system.processing_engine_logs` queries (correct schema: `event_time`, `trigger_name`, `log_level`, `log_text`).
- 5 new manual smoke prompts (#13–#17) and 10 new formal eval prompts (5 plugin positives + 3 adversarial + 2 negative deferral).
- Cross-reference line in the `influxdb3` skill's §9 pointing developers at the new plugin skill.

### Changed
- Bumped `.claude-plugin/plugin.json` version to `0.2.0` and added `skills/influxdb3-plugins` to the skills array.

### Known limitations (deferred)
- Distributed cluster placement (`--node-spec`, ingester vs query nodes, WAL fan-out, schedule-write-back-via-HTTP) — planned for v0.2.1.
- Air-gapped setup (`--package-manager disabled`), full Explorer-compatible plugin metadata schemas, and TOML config files — planned for v0.3.0+.
- HTTP request plugins have no offline test command (`influxdb3 test request_plugin` does not exist) — they're tested via real triggers and `curl`.

## [0.1.0] — 2026-04-29

### Added
- Initial release: skill covers Connect & authenticate, Write data, Query data, Schema design.
- First-class support for Python, JavaScript/TypeScript, Go, Java, C# clients.
- Raw HTTP / curl fallback for any other language.
- All four InfluxDB 3 flavors: Core, Enterprise, Cloud Serverless, Cloud Dedicated.
- `/ping`-based flavor detection (logic ported from `influxdb3_ui`).
- 12 manual smoke prompts and a 30-prompt formal eval suite.
- Local-only distribution via `~/.claude/plugins/` symlink.
- All six client examples (HTTP, Python, JS, Go, Java, C#) verified end-to-end against a live Enterprise 3.8.4 instance during development.

### Known limitations
- Database & token management not yet covered (planned for v1.1).
- Troubleshooting / debugging not yet covered (planned for v1.1).
- Performance tuning not yet covered (planned for v1.1).
- v1/v2 → v3 migration not yet covered (planned for v1.2).
- App-pattern templates not yet covered (planned for v1.3).
