# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.1] — 2026-05-08

### Added
- New reference `skills/influxdb3/references/installing.md` — covers Core + Enterprise install via the official install script and Docker, first-boot `serve` invocation, operator-token bootstrap, `/ping` verification. Cloud Serverless and Cloud Dedicated explicitly out of scope (managed services — direct users to signup, do not create accounts).
- New SKILL.md section §1.5 "Don't have an instance yet?" routes onboarding users to `installing.md` before §2 (which still assumes a running instance).
- Cross-link added at the top of the plugins skill's `installing.md` to disambiguate server-install vs plugin-engine-install.
- Two new manual smoke prompts (#28 Core install, #29 Enterprise install).

### Fixed
- Live verification surfaced three install-doc bugs caught and fixed before tag:
  - Enterprise `serve` example was missing required `--cluster-id` flag (used as Enterprise Catalog prefix in the object store). Cross-checked against the production cmdline and corrected.
  - Enterprise license-activation flow was undocumented; added a section on `--license-email` / `--license-type` (`home`/`trial`/`commercial`) / `--license-file`, with a quirk note that headless boots block on email verification unless the license is pre-cached or supplied via `--license-file`.
  - Cloud signup URL `/products/influxdb-cloud/` was a 301 redirect; updated `installing.md` and `SKILL.md` §1.5 to use the canonical `/products/influxdb-overview/` destination.

### Verified
- All 10 documented Enterprise serve flags exist in `serve --help-all` on Enterprise 3.8.4. Bootstrap command (`influxdb3 create token --admin`) parses correctly. All documented URLs return HTTP 200.
- Production instance at `localhost:8181` was completely untouched throughout verification: `GET /ping` 200 before+after, 51 databases before+after, port 8281 (test sandbox) left clean. Test sandbox used `--object-store memory`, distinct `--node-id`, temp plugin-dir, trapped cleanup. Verification log: `evals/results/install-verification-v0.4.1-2026-05-08.md`.

### Changed
- Bumped `.claude-plugin/plugin.json` to `0.4.1`; both skill `version` fields to `0.4.1`.

## [0.4.0] — 2026-05-08

### Added
- New SKILL.md section §12 "Troubleshooting & debugging" in the `influxdb3` skill; new "Plugin troubleshooting" section in the `influxdb3-plugins` skill.
- Three new references — `skills/influxdb3/references/quirks.md` (canonical home for non-obvious behaviors, 12 entries from v0.1–v0.3 build evidence), `skills/influxdb3/references/troubleshooting.md` (app + admin), `skills/influxdb3-plugins/references/troubleshooting.md` (plugin runtime).
- A diagnostic toolkit at `skills/influxdb3/examples/diagnose/` (Python; one-page health report; verified end-to-end against the live Enterprise instance).
- Five broken→fix demo pairs at `skills/influxdb3/examples/troubleshooting/`: silent_auto_create, admin_token_at_data_plane, table_batches_attr_access, tokens_permissions_parse, ping_head_404. Each verified live.
- 5 new manual smoke prompts (#23–#27) and 6 new formal eval prompts (3 troubleshooting + 1 adversarial + 2 negative deferrals).
- Cross-references in `connecting.md`, `writing.md`, and `testing.md` pointing to the new troubleshooting refs.

### Changed
- Bumped `.claude-plugin/plugin.json` to `0.4.0`; both skill `version` fields to `0.4.0`; both descriptions extended with troubleshooting trigger keywords.
- `SKILL.md` §9 deferred-topics lists: removed "Troubleshooting & debugging" (now covered); added "Performance tuning → v0.5.0" in the main skill.

### Known limitations (deferred)
- Performance tuning (slow queries, slow writes, cardinality remediation, batch-size optimization) — planned for v0.5.0.
- Cluster placement troubleshooting — already deferred to v0.2.1.
- Air-gapped troubleshooting — already deferred to v0.3.1.
- Lost operator + admin token simultaneously — documented in `troubleshooting.md` as "contact support" (no purely-client-side recovery).

## [0.3.0] — 2026-05-08

### Added
- New SKILL.md sections §10 (Database management) and §11 (Token management) in the `influxdb3` skill.
- Three new references — `references/admin-http-api.md` (wire-format ground truth, verified live against Enterprise 3.8.4), `references/databases.md`, `references/tokens.md` — covering CLI + HTTP API for both DB and token CRUD plus the safe rotation pattern.
- Six runnable admin lifecycle examples — `examples/admin-{python,javascript,go,java,csharp,http}/` — each verified end-to-end against the live Enterprise 3.8.4 instance. Lifecycle: list → create DB → create scoped token → write a point → list/filter tokens via SQL on `system.tokens` → rotate → delete original → delete DB → delete rotated → final orphan check.
- 5 new manual smoke prompts (#18–#22) and 8 new formal eval prompts (4 admin + 2 adversarial + 2 negative).
- Cross-references in `references/connecting.md` and new rows in `references/flavors.md` for admin APIs.

### Changed
- Bumped `.claude-plugin/plugin.json` to `0.3.0`; `influxdb3` skill version to `0.3.0`; description field extended with admin keywords.
- `SKILL.md` §9 deferred-topics list: removed "Database & token management"; added "Air-gapped setup → v0.3.1".

### Known limitations (deferred)
- Cloud Serverless and Cloud Dedicated admin API runtime verification — planned for v0.3.1 (no live Cloud test instance available; Cloud-flavor request shapes documented as reference shape only).
- Air-gapped setup (`--package-manager disabled`, custom plugin repos, offline mirrors) — planned for v0.3.1.
- Resource-token HTTP create endpoint differs between Core (`/api/v3/configure/token`) and Enterprise (`/api/v3/enterprise/configure/token`); examples target Enterprise — README documents the one-line swap for Core.
- Token CRUD via plugin runtime (admin operations from inside `process_request` / etc.) — explicitly out of scope; plugins use args-based tokens, not admin tokens.

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
