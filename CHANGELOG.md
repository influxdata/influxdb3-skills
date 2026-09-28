# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 0.7.0

### Packaging
- Renamed the repo from `influxdata/claude-skill-for-influxdb3` to `influxdata/influxdb3_skills`, the plugin from `claude-influxdb3` to `influxdb3-skills`, and its marketplace from `influxdata` to `influxdata-influxdb3`. Skill names don't change.
- Added a root `plugin.json` in the Agent Plugins format, so agents other than Claude Code can install the repo.
- The README gives install steps for Claude Code, Codex, and other agents.
- Removed Claude-specific wording from skill text.
- Shortened both skill descriptions to fit the Agent Skills 1024-character limit, and rewrote `influxdb3/SKILL.md` in plainer style. The `influxdb3` description no longer targets InfluxDB OSS v1 or v2, InfluxDB Cloud (TSM), InfluxDB Cloud 1, or Flux. Agents answer those directly. If the skill loads for one of them, its body still routes to the docs MCP server and `llms-full.txt`.
- Added CI: the Agent Skills reference validator on each skill, a check that all versions match, and a link check. Added Dependabot for GitHub Actions.

### Security
- Plugins run unsandboxed with the server's privileges.
  The new `influxdb3-plugins` reference `plugin-code-safety.md` sets rules for generated plugin code:
  don't execute untrusted data, parameterize `query()` with `args=`, and don't read, log, or return secrets.
- `installing.md` and `dependencies.md` document `gh:` plugin paths, `--plugin-repo`, and `influxdb3 install package` as trust boundaries.
  `installing.md` lists the plugin hardening flags (3.10.0+):
  `--plugin-dir-only` (Enterprise only) and `--restrict-plugin-triggers-to` (Core and Enterprise).
- Both skills treat error bodies, query results, log text, and database or token names as untrusted data, never as instructions.
- The token-redaction regex is broader and case-insensitive.
  The rule applies to any credential-shaped string.
  It's behavior the agent follows, not an enforced filter.
- The `doc-urls.md` allowlists are advisory.
  Agents match the exact host.
- Examples that auto-load `.env` note that `INFLUXDB_HOST` decides where the token is sent.
- Line protocol has no escape for `\n` or `\r`, and `LineBuilder` doesn't escape them.
  `writing.md` and `runtime-api.md` say to reject or strip them from untrusted values.
- The admin examples bind token names as SQL parameters instead of interpolating them.
- Plugin code doesn't write state or secrets to the filesystem, even to a path the developer names.
  `plugin-code-safety.md` §4 lists the alternatives: `influxdb3_local.cache`, a measurement for state that survives a restart, and trigger `args` for credentials.
- Plugin files stay inside `--plugin-dir`.
  The skill names the symlink rule and doesn't suggest workarounds.
  `installing.md` separates `--path` with and without `--upload`.

### Fixed
- InfluxDB 3 Core has admin tokens only, with no resource tokens and no RBAC.
  The skill told Core users to create `--permission` tokens.
  It also documented a Core resource-token endpoint that doesn't exist.
  `tokens.md` → "InfluxDB 3 Core: admin tokens only" is now the one place that states the Core behavior.
  Each Core application uses its own named admin token.
  The admin examples require Enterprise or InfluxDB 3 Cloud.
- Named admin tokens use `POST /api/v3/configure/token/named_admin` with `{"token_name", "expiry_secs"}` (live-verified on Core and Enterprise 3.11.5).
  `POST /api/v3/configure/token/admin` takes no body and creates the operator token.
  `admin-http-api.md` adds the operator-token regenerate endpoint.
- `--permission` examples include the required `--name`.
- `--object-store` is required with no default (3.2.1+).
  The skill said the default was `file`.
- `influxdb3 delete database` prompts for confirmation (3.10+).
  Scripts pass `-y`/`--yes`.
  There's still no `--force`.
- `influxdb3 delete token` also prompts for confirmation (observed on 3.11.5), so the token examples pass `-y`.
- SKILL.md §2 gives the setup checklist alongside the code instead of holding the code back to ask questions.
  `databases.md` adds a create, write, and drop walkthrough that writes with an app token, not the admin token (live-verified on Core and Enterprise 3.11.5).
  SKILL.md §10 makes the app-token write a rule, including one-off demos.
  `clients/java.md` says Core and Enterprise use the same client and endpoints.
- `/ping` is auth-gated (3.10+).
  Health-check snippets send a token.
  An unauthenticated 401 still means the server is up.
- `/api/v3/query_sql` `params` is a named object referenced as `$name`.
  `clients/http.md` showed a positional array, which returns 400.
- Enterprise user authentication and RBAC are a preview (3.10+), off by default.
  `flavors.md` described RBAC as first-class.
- The operator token can't be deleted, only regenerated.
  `tokens.md` told the agent to revoke it after bootstrap.
- SKILL.md §4 lists three rules that hold even when the developer asks otherwise:
  don't hard-code a token; don't write a `.env` that `.gitignore` doesn't cover;
  and don't replace an unreachable instance with fake data.
  The description now names unreachable-instance requests so the skill loads for them.
- Deferred topics (air-gapped setup, performance tuning, and migration, including rewriting v1 or v2 client code) lead with the deferral and a docs URL.
  `doc-urls.md` adds a "Topics this skill defers" table.
  The plugins skill's air-gapped guidance no longer walks through offline installs.
- InfluxDB 3 doesn't run Flux, so the skill doesn't write Flux, even as a comparison.
- SKILL.md §5 says to use second precision unless a series gets more than one point per second.
  `writing.md` no longer says coarser precision makes queries faster.
- The plugins skill notes the `time` column in `system.processing_engine_logs` (3.11.0+).
  Its `quirks.md` links point at the `influxdb3` skill, where the file lives.
- Examples run on the current client minors: influxdb3-python 0.21, JavaScript 2.4, Go 2.17, Java 1.11, and C# 1.10 (live-verified on Core and Enterprise 3.11.5).
  The Go README adds `go mod tidy`, and the Java docs add the Arrow Flight JVM options, including `--sun-misc-unsafe-memory-access=allow` on JDK 27.

### Changed
- Both skills drop verification history (build dates, "verified against" notes, and "per source" notes) and skill-version roadmap references (`v0.x`).
  Version-support notes stay, written as `X+` (for example, `3.10+`).

## 0.6.0 (unreleased)

Content checked against the InfluxDB 3 Core and InfluxDB 3 Enterprise 3.11.5 docs and release notes.
Live evals on 3.11.5 are still pending.

### Boundaries
- `influxdb3` names each product it covers in full: InfluxDB 3 Core, InfluxDB 3 Enterprise, InfluxDB 3 Cloud, InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered. Core and Enterprise get full guidance. The other products route to their own docs for tokens, databases, and product-specific behavior.
- For InfluxDB OSS v1, InfluxDB Enterprise v1, InfluxDB OSS v2, InfluxDB Cloud (TSM), InfluxDB Cloud 1, and Flux, the skill routes questions to the InfluxDB Documentation MCP server and each product's `llms-full.txt` instead of answering from memory. The description names these products so the skill fires for them.
- Both skills look things up in this order: the InfluxDB docs MCP server, then the `influxdb3` CLI or InfluxDB 3 MCP server for live state, then curated doc URLs. Neither MCP server is required.
- Both skills tell the agent not to state version-sensitive flags, defaults, or limits from memory, and to report observed behavior that contradicts the docs, with product and version. `--help` text alone doesn't count as evidence against the docs.

### Fixed
- `/api/v3/write_lp` accepts partial writes by default (`accept_partial=true`), so a 400 doesn't mean the whole batch was rejected. `writing.md`, `troubleshooting.md`, `quirks.md` entry 11, and `SKILL.md` said the opposite.
- On Core and Enterprise 3.11.5 (live-verified), `/api/v2/write` and `/write` reject the whole batch when one line is invalid. The v1 compatibility route is `/write`, not `/api/v1/write`.
- Added "no response" to the write error table as retriable. On 3.11.5, a write to a node stopped with `influxdb3 stop node` got a connection reset, not the 503 that the 3.11.0 release notes describe (live-verified).
- The official clients write through `/api/v2/write` by default starting in influxdb3-python 0.20.0, JavaScript 2.3.0, Go 2.15.0, Java 1.10.0, and C# 1.9.0. `writing.md` and each client reference say how to opt into `/api/v3/write_lp` for partial writes and `no_sync`.
- `tokens.md` notes that regenerating the operator token invalidates the old token immediately (live-verified on Core 3.11.5).
- Added 403 to the write error table. Starting in 3.10.0, `/api/v2/write` returns 403, not 401, for a valid token without write permission.
- Duplicate tag keys are rejected with 400 starting in 3.9.8, 3.10.3, and 3.11.0. Earlier versions accepted them and then crash-looped on WAL replay.
- InfluxDB Cloud Serverless and InfluxDB Cloud Dedicated have no `/api/v3` endpoints. They write through `/api/v2/write` and query through Flight or the v1 `/query` endpoint. `flavors.md` said Cloud Dedicated had the same v3 API as Core, and the flavor-detection snippets probed a Serverless `/api/v3/databases` endpoint that doesn't exist. `flavors.md` is now the one place that lists per-product endpoints.
- Schema guidance no longer applies InfluxDB v1/v2 cardinality advice. InfluxDB 3 supports unlimited tag cardinality, and a row is identified by its tags and timestamp, so identifiers such as `gpu_id` are tags. As fields, GPUs on one host would overwrite each other.
- `--package-manager` is deprecated in 3.10. Starting in 3.11.0, `--disable-package-management` blocks plugin package installation. `dependencies.md` now gives the flag for each version.
- `quirks.md` entry 10 said `time` isn't a column of `system.processing_engine_logs`. Starting in 3.11.0, `time` is the physical column and `event_time` is a virtual alias. Examples keep `event_time`, which works on every version.
- Asynchronous triggers with `--error-behavior retry` retry a limited number of times starting in 3.11.0, not indefinitely.

### Packaging
- Moved `version`, `last_verified`, and `verified_against` in both `SKILL.md` files under `metadata:`, as the Agent Skills spec requires. Docs-checked and live-verified versions are now recorded separately.
- `docs/publishing.md` and the README describe the new metadata fields.

### Earlier unreleased changes

Findings from a hands-on test pass (local bring-up + sustained write/query load). All changes are in the `influxdb3` skill.

### Added
- **`references/installing.md`**: new "Object store" section. Documents that `--object-store` defaults to `file` (requires `--data-dir`) — *not* `memory` as the binary's `--help` text wrongly claims — lists the `s3`/`google`/`azure` remote backends, and warns that the opt-in `memory` store is RAM-only and grows without bound under sustained writes (can OOM the host) and won't cache the Enterprise license.
- **`references/querying.md`**: note that `format=json` returns timestamp columns as ISO-8601 strings (Apache Arrow JSON default, version-independent); do time math in SQL with `date_part('epoch', …)`.
- **`references/tokens.md`**: when scripting token capture, use `influxdb3 create token --format json` and parse the `token` field — the default text output emits ANSI color codes (even when piped) that corrupt a naively-grepped token.

### Fixed
- **Enterprise license bring-up**: the skill now instructs Claude to **ask** the developer for a license email and license type before starting Enterprise, instead of only showing static `--license-email`/`--license-type` placeholders. Surfaced in both `SKILL.md` §1.5 and `references/installing.md`.
- **Corrected the license quirk** in `references/installing.md`: a license-less, no-TTY Enterprise start **fails fast** (`No interactive TTY detected. Cannot prompt for email.`) rather than "blocking indefinitely" as previously stated; clarified that supplying `--license-email` is what clears the no-TTY failure.
- **`SKILL.md` §1.5** now also triggers for the "binary installed but no server running" case, not just "no instance anywhere".

### Changed
- Bumped `SKILL.md` `last_verified` to 2026-05-24 and `verified_against` core/enterprise to 3.9 (license flags are hidden from `serve --help` on 3.9.0 but remain functional).

## [0.5.2] — 2026-05-19

### Fixed
- **Plugin write API**: skill content now teaches `influxdb3_local.write_sync(line, no_sync=True)` as the preferred plugin-write pattern instead of the legacy `influxdb3_local.write(line)`. Per Plugins-PM reviewer feedback (Ryan Cater) and confirmed by introspecting the live Enterprise 3.8.4 binary, the runtime itself labels `write` and `write_to_db` as **legacy** in their own docstrings:
  - `write` / `write_to_db`: "Legacy api that batches writes and writes them at the end of plugin execution."
  - `write_sync` / `write_sync_to_db`: "Writes synchronously via the write buffer."
- Corrected the documented `write_sync(line, no_sync)` signature in `references/runtime-api.md` — `no_sync` is a **required positional argument** (no default), not the `no_sync=False` shown previously. Verified by attempting `write_sync(line)` on the live runtime, which fails with `TypeError: PyPluginCallApi.write_sync() missing 1 required positional argument: 'no_sync'`.
- Added a "no_sync=True vs no_sync=False — which to pick" decision table in `references/runtime-api.md` explaining the durability vs throughput trade-off.

### Changed
- All four plugin examples updated to use `write_sync(line, no_sync=True)`:
  - `examples/wal/process_writes_hello.py`
  - `examples/scheduled/process_scheduled_call_hello.py`
  - `examples/cache_counter/counter.py`
  - `examples/multifile_alert/processors.py`
- `references/trigger-types.md` data-transformation use case updated.
- Smoke prompt #14 pass criteria updated to require `write_sync(line, no_sync=True)`.
- README Status line caught up from v0.4.2 → v0.5.2 (was stale through the v0.5.0 and v0.5.1 releases).

### Verified
- `write_sync(line, no_sync=True)` confirmed working live on Enterprise 3.8.4 (data lands in the target table). Trigger cleanup successful; orphan check clean.

## [0.5.1] — 2026-05-15

### Fixed
- `references/trigger-types.md` — the `# always cast — args values are strings` comment in the worked example was accurate for inline `--trigger-arguments` but became misleading after v0.5.0 added TOML config (which preserves native types). The comment now distinguishes the two paths and cross-links to the TOML coverage.
- `references/troubleshooting.md` — clarified that the `${INFLUXDB_TOKEN:0:8}` env-var truncation in the auth-failure diagnostic does NOT violate the redaction rule (the rule forbids echoing tokens pasted INTO Claude's input; developers inspecting their own env vars on the command line is unrelated).

### Known gaps (still deferred)
- `admin-http-api.md` — HTTP body shape for `update database` retention period is undocumented upstream (verified against InfluxData docs). Skill continues to recommend the CLI path.
- Cloud Serverless / Cloud Dedicated token shape verification — requires runtime testing against real Cloud instances; queued for a future release.

## [0.5.0] — 2026-05-15

### Added
- **Plugin configuration via TOML** — `references/plugin-structure.md` now documents the built-in `config_file_path` mechanism: the engine loads a TOML file from `PLUGIN_DIR` and merges its keys into the `args` dict passed to the plugin entry-point, preserving native types.
- New `examples/toml_config/` example: a scheduled-trigger "threshold notifier" plugin with a matching TOML file, demonstrating scalar values, nested tables, and the InfluxData `<plugin>_config_<trigger_type>.toml` naming convention.
- Short cross-link from `references/triggers-cli.md` (in the `--trigger-arguments` section) pointing at the new TOML coverage.
- New eval prompt #30 in `evals/smoke-prompts.md` covering the TOML config mechanism, with hard-blocks against the wrong-mental-model trap (importing `tomllib` inside the plugin) and the made-up-mechanism trap.

### Removed
- Deferral note "TOML config files for plugins → v0.3.0+ covers TOML config patterns" from `SKILL.md` — replaced by actual coverage.

## [0.4.2] — 2026-05-08

### Changed
- **Install method**: replaced the `~/.claude/plugins/` symlink approach with the standard Claude Code marketplace flow. Users now run `/plugin marketplace add influxdata/claude-skill-for-influxdb3` and `/plugin install claude-influxdb3@influxdata`. The previous symlink instructions did not register the plugin with Claude Code's plugin system and produced no installed entry.
- README Install section rewritten; new "Develop locally" subsection covers contributor workflow against a local clone, including the `/plugin marketplace remove` step needed to avoid name collision with the published marketplace.
- Bumped `.claude-plugin/plugin.json` to `0.4.2`.

### Added
- `.claude-plugin/marketplace.json` — makes the repo self-installable as a Claude Code marketplace named `influxdata`, with `claude-influxdb3` as its single plugin sourced from `./`.

### Fixed
- Removed the `skills` array from `.claude-plugin/plugin.json`. The current Claude Code schema rejects it (`Validation errors: skills: Invalid input`), causing `/plugin install` to fail. Skills auto-discover from the `skills/` directory, so the explicit list was redundant as well as invalid.

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
