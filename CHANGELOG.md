# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Claim IDs (`claim-YYYYMMDD-NNNN`) refer to InfluxData's internal verification ledger. They aren't publicly resolvable and need no action.

## [0.7.3] — 2026-11-13

Both skills move from InfluxDB 3 Core and Enterprise 3.11.5 to 3.12.1.
The `influxdb3` skill covers fewer products, and rules that different files stated differently now each have one home.

### Scope

- The `influxdb3` skill covers InfluxDB 3 Core, InfluxDB 3 Enterprise, and InfluxDB 3 Cloud only.
  InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered have no `/api/v3` endpoints and use different tokens and databases.
  The skill's guidance for them was thin and partly wrong, so it's removed.
  The description still names them, including a bare "InfluxDB Cloud", so the skill loads, identifies the product, and gives only a docs link: no steps, commands, or UI paths.
- The skill identifies the product from the host name and the `/ping` version headers.
  The signal table is in the `influxdb3` body, which agents read.
  A host that ends in `enterprise.influxdb.io` is InfluxDB 3 Cloud.
  The agent checks `x-influxdb-version` before `x-influxdb-build`, because InfluxDB Enterprise v1 also sends `x-influxdb-build: Enterprise`.
- "Cloud" or "InfluxDB Cloud" alone is ambiguous.
  The skill names the products it can mean, and the agent asks before giving product-specific steps.
  When it asks, it gives token steps only for InfluxDB 3 Cloud.
- The skills no longer contain version test notes, such as test outcomes and "on 3.12.1" qualifiers.
  Where a test established a behavior the docs don't cover, the rule stays.
  `docs_checked_against` in the frontmatter records the version baseline.
- Testbench observations stay attributed to the product and version that produced them.
  Earlier review edits had generalized Core 3.12.1 results, such as duplicate rows after rewrites, to every 3.12.1 deployment.
- Explicit-schema administration and distributed plugin placement remain separate work.

### Plugins

- Test a plugin before you create its trigger.
  Put the file on the server with `POST /api/v3/plugins/files` or a copy into the plugin directory, run `influxdb3 test wal_plugin` or `influxdb3 test schedule_plugin`, and then create the trigger (#44).
- Admin calls stay outside the plugin.
  A key the plugin needs goes in a trigger argument that the operator sets.
  Before the setup steps, the agent says trigger arguments are stored as plain text and readable through `system.processing_engine_trigger_arguments`.
  It recommends a new key for that plugin alone, with only the permissions its call needs, never logged.
- To reuse a shared file, copy it under `--plugin-dir`.
  Don't mount its directory inside `--plugin-dir`: the file stays where it lives, and anyone who can write there changes the plugin's code.
- For a plugin error, check the server log first.
  An uncaught exception can skip `system.processing_engine_logs`.
- Trigger logs are in the trigger's database or in `_internal`.
  Query `system.processing_engine_triggers` in `_internal` with the admin token, and filter plugin log queries by `trigger_name`.
  `system.plugin_files.plugin_name` is the trigger name.
- Cron trigger schedules use UTC and 6 fields, with an optional year; 5-field expressions are rejected.
  Numeric weekdays start at `1` = Sunday, so `1-5` runs Sunday through Thursday.
  The skill recommends day names.
- Plugins use the embedded venv at `<PLUGIN_DIR>/.venv`, or the `--virtual-env-location` path.
  Don't build it with system Python.
  The skill names the venv path and the system-Python warning at the package install step, where agents read them.
  The plugin import quirk applies to any package, not only pandas.
  After a restart, the server reuses that venv, so a changed path or an unpersisted container volume gives an empty venv.
- Runtime API corrections from the Python API reference:
  - `query()` takes an optional `database`, and its `args` values must be strings.
  - `except QueryError` raises `NameError`, so catch `Exception` and check the type name.
  - `write()` and `write_to_db()` are documented queued writes.
    A rejected queued write surfaces after the run as an `ERROR` log row.
  - The skill no longer promises at-least-once plugin writes, or that `error()` is recorded in a return payload.
  - `process_request` can return a list, which the engine encodes as JSON.
- For TOML configuration, set `PLUGIN_DIR` on the server, put the file there, and pass `config_file_path`.
  The plugin reads and parses the file, keeping the path inside `PLUGIN_DIR`.
  The engine doesn't load it.
  This replaces the base64 trigger-argument workaround.
- On Core and Enterprise 3.12.1, `update trigger` reads the local `--path` file and rejects `--upload`, and `delete trigger --force` deletes an active trigger.
- HTTP `trigger_settings.error_behavior` values are lowercase.
  For other trigger settings, the skill points to the API reference or the InfluxDB Documentation MCP server.
- `install package` and `enable trigger` take `--token` like every other admin command.
- "Trigger doesn't fire" starts with the single-node scope note.
  The scope note no longer names plugin placement flags, and it says single-node deployments don't have the routing problem.
  The step that described trigger pinning on clusters is removed.
  Agents repeated both as placement guidance.
- The plugin-runtime quirks (`table_batches` items are dicts, plugins see only the embedded venv, and the log columns) moved into the plugins skill, which loads on its own.

### Writes, queries, and schemas

- Points that share a table, tag set, and timestamp merge, and which field value survives isn't guaranteed.
  The skill no longer calls this an overwrite.
  A timestamped retry merges into the first point.
  Write each change as a new point, and use a tag for anything that identifies a series.
- Write the event's own timestamp.
  A point with no timestamp gets the server's receive time, so a retry lands as a second point.
- The write rules are in the `influxdb3` body:
  - `/api/v3/write_lp` accepts partial writes and lists the rejected lines.
  - The compatibility endpoints reject the whole batch.
  - The clients default to `/api/v2/write`, with an opt-out to V3.
  - Precision is seconds by default, so points from one series in the same second merge.
  - Retriable and non-retriable statuses.

  `http.md` drops its own status table, which said 404 meant a missing database.
- Batch up to 10,000 lines or 10 MB, the docs' optimal size, and flush on a timer for live streams.
- A write to a misspelled database creates that database instead of failing.
  The 404 symptom row points to silent auto-create.
- The duplicate-tag-key fix is stated per release line.
  "3.9.8+" read as covering 3.10.0 through 3.10.2, which still accept the point.
- The `influxdb3` body states the naming and reserved-word rules, and that `/ping` requires a token by default unless `--disable-authz` opts it out.
- Use InfluxQL when the developer asks for it, and SQL otherwise.
- The skill explains query timeouts and access to named system-table columns.

### Tokens and security

- Each `SKILL.md` has one token block: the variable names, `--token "$INFLUXDB_ADMIN_TOKEN"` for admin commands, never writing a token into code, and a separate application token.
  A CI check keeps the two copies identical.
- `INFLUXDB_TOKEN` and `INFLUXDB_ADMIN_TOKEN` are the skill's names.
  The `influxdb3` CLI reads `INFLUXDB3_AUTH_TOKEN` when `--token` is absent.
  Every admin CLI command, the admin lifecycle examples, the demos that manage databases, tokens, and triggers, the example runner, and CI read the admin token from `INFLUXDB_ADMIN_TOKEN`.
- The admin token has full access to the instance, so a leak exposes everything.
- `serve` doesn't print a token.
  Create the first one with `create token --admin`, including the Docker form, and save it as `INFLUXDB_ADMIN_TOKEN`.
  Load `.env` before the verify step.
  Capturing it without `--token` works only for the first admin token.
  The skill says where to store the bootstrap and operator tokens.
- Core has admin tokens only.
  It creates a named admin token through `/api/v3/configure/token/named_admin` and has no `POST /api/v3/configure/token`.
- When a developer pastes a token, the skill recommends not repeating it.
  The agent gives both the `create token` command for the replacement and the `delete token --token-name` command for the exposed token, with a link to the rotation pattern.
  Diagnosis can continue before the rotation.
- During rotation, revoke the old token as a separate step after consumers confirm the switch.
  A fixed wait doesn't show they switched.
- The 401 checklist covers the admin token, and its check prints no token characters.
- Lost-admin-token recovery uses the docs' `--admin-token-recovery-http-bind` method.
  Regenerating the operator token isn't needed when another admin token works.
- `system` permissions cover system endpoints such as `/health`, are read-only, and don't read system tables.
- For per-user tokens, the agent leads with the identity-layer recommendation.
  Resource tokens are scoped to whole databases.
- For `.gitignore`, mock-data stubs, the database-existence check, and an admin token used for app writes, the agent explains the risk and then follows the operator's choice.
  It still never hard-codes a token in code it writes.
- `connecting.md` uses the admin token to list and create databases, because a scoped token gets a 403 on create and a filtered list.

### Install and troubleshooting

- The production install routes are DEB/RPM packages and Docker, and "Other install methods" leads with them.
  The Docker example is pinned to `3.12.1`.
  The install script installs the latest release.
  The license activation steps appear once.
  The unsourced `~/.influxdb/` binary path is removed.
- The local object-store recommendation includes `--data-dir`.
- When only `--help` text disagrees with the docs, neither is proven.
  The agent recommends a behavior test or a support question, and suggests reporting the discrepancy.
- The skill gives the default request size for a 413, and the symptom tables have rows they were missing.
- The Core and Enterprise admin endpoints are the HTTP API, not a "management API".
  Management APIs belong to InfluxDB Cloud Dedicated and InfluxDB Clustered, and InfluxDB Cloud Serverless has no customer-facing management API.
- Examples an agent would copy are fixed: `batch["rows"]`, a 6-field cron spec, a working engine check, a timeout-safe detection snippet, and `.gitignore` before `.env` writes.
  The `plugin-structure.md` trigger commands pass `--token "$INFLUXDB_ADMIN_TOKEN"` and `$INFLUXDB_DATABASE`, and its runtime API snippets have defined values and return early after a caught `QueryError`.
- `flavor-detection.md` no longer has Python and JavaScript snippets.
- `references/troubleshooting.md` has a table of contents.
- Skill references link to the API reference instead of duplicating it.
- Enterprise authentication is generally available and remains opt-in.

### Skill structure

These changes make the skills work for a Sonnet-level model that reads the skill body and few references.

- Each rule has one home: auto-create, the write rules, the untrusted-input rules, and cleanup.
  References no longer point back at `SKILL.md`.
  The `influxdb3` body is 2,883 words, down from 3,165 at its peak.
- The descriptions have one trigger per branch.
  The `influxdb3` description opens with "Load it before answering any InfluxDB 3 … question, even one you think you know", and says "question or task".
  Its topic list names batching, timestamps, partial writes, and naming, and it keeps unreachable instances and mock-data stubs.
  influxdb3-python replaces the client package list as the example, to stay within the 1,024-character limit.
- Every example is linked from the section that needs it.
- File and section references are relative Markdown links, and CI checks them.
  Two references named headings that no longer exist; they now point to "List tokens" and "Short-form vs structured permissions".
  The `/ping` API reference link now points to the identify-version page.

### Removed

- The JavaScript, Go, Java, and C# examples, including their admin lifecycle examples.
  The `curl` and Python examples remain, and the language table links the other client libraries.
  The `references/clients/*.md` guides stay.

### Live-verified behavior corrections

- On 3.12.1, query-memory exhaustion before the first row returns 429 on Enterprise and 500 on Core. The Core 3.12.2 release notes say Core now returns 429, except in some cases, such as running out of memory while deduplicating. Hidden databases can't be told apart from absent ones by an empty 403 alone. Query error bodies match the 3.12.1 claims. Claims: claim-20261015-0101, claim-20261015-0102, claim-20261015-0107, claim-20261015-0108, claim-20261015-0113, claim-20261015-0114, claim-20261015-0115.
- Plugin files are created with a JSON POST, trigger settings are optional, a package install is verified beyond its HTTP status, and existing explicit schemas are handled. Claims: claim-20261024-0304, claim-20261024-0312, claim-20261024-0305, claim-20261024-0313, claim-20261024-0306, claim-20261024-0314, claim-20261024-0308, claim-20261024-0317, claim-20261024-0303, claim-20261024-0311.
- TOML parsing belongs to plugin code, and `config_file_path` doesn't make the engine merge TOML values into trigger arguments. Claims: claim-20261024-0318, claim-20261024-0319.
- After a 403 on a health route, the diagnostic toolkit checks permitted read access and reports limited read-side health. Claims: claim-20261024-0316.
- Uncaught plugin exceptions reach the server log, with type and message and no traceback, but not `system.processing_engine_logs`. On Enterprise, check every node that runs the trigger. Claims: claim-20261024-0320, claim-20261024-0321, claim-20261024-0322, claim-20261024-0323, claim-20261024-0327, claim-20261024-0328.
- The plugins testing reference has one table of every `system.processing_engine_logs` column observed on 3.12.1, including `time`, `run_id`, `node_id`, `database_name`, `plugin_filename`, and `error_details`. `time` and `event_time` hold the same value. The troubleshooting, trigger, and body sections that listed four columns now point to that table. `error_details` stays empty for an uncaught exception, and the table holds no ERROR row even 60 seconds after the failure, past the up-to-50-second delay the docs describe. Claims: claim-20261106-0001, claim-20261106-0002, claim-20261106-0003, claim-20261106-0004, claim-20261106-0005, claim-20261106-0006.

### Packaging and verification

These changes are for maintainers.

- Both skills stay one package. Every skill-changing merge to `main` needs a new shared version and evidence on the final content.
- The eval suite has 98 cases, up from 72 in 0.7.2.
- Release gating:
  - Claude Code results gate the release.
    Sonnet answers are the default gate, and 0.7.3 gates on Opus answers, at the maintainer's choice.
  - Codex evidence must be complete, with three runs per case, but its bars don't block.
  - Changed eval cases must pass individually, as well as the aggregate bars.
  - ADR-0004: `claude-opus-5-5` at `medium` effort judges both agents' release suites, and `gpt-6.1-sol` at `medium` is the audit judge before an adversarial failure blocks a release.
    `check-release.mjs verify` requires both agents' evidence to use the same judge model and effort.
  - The release review reads the current docs-v2 and production release notes for 3.12.1 and 3.12.0.
- Graders:
  - Cases can declare `regex`, `tool_used`, and `skill_loaded` checks and `fixture` files.
    The gate passes a run only when every grader passes.
    Run Claude evals with `--scaffold`.
  - Every adversarial case blocks on a regex check.
  - Thirty judged criteria moved to 40 `regex` checks, because each names a string the answer must or must not contain (#49).
  - Five judged criteria that judges read differently now state one condition each, and three cases no longer ask the judge whether generated code works (#49).
  - Five cases whose prompts don't name InfluxDB 3, or state no task, run inside a project fixture, and four of them count toward a separate trigger bar.
- Eval tooling:
  - The Codex runner judges with `claude-opus-5-5` by default, through the same call as the new `evals/rescore.mjs`, shared in `evals/judge.mjs`.
    The judge schema fixes the number of checks, and a judge failure counts as a harness error, not a failing answer.
  - `evals/rescore.mjs` re-scores stored answers with candidate judges and lists the criteria where they split.
  - Codex follow-up cases give the judge the same earlier turn as the answering model.
  - Each eval run keeps its scaffold directory with `--keep-temp`.
- Eval cases and criteria:
  - Cases that asked for several tasks are split into one case per task, and each criterion makes one check.
  - Criteria that required exact recall, one specific tool, or wording, or that checked test narration or something the prompt didn't ask, are revised or dropped.
  - Six prompts are self-contained, and five cases that tested only removed test notes are dropped.
  - The cache-lifetime and trigger-argument advice moved to two plugin cases, `plugins-cache-restart` and `plugins-secret-trigger-arg`.
  - Four cases check product identification from the host and headers, and `plugins-test-before-trigger` checks the testing order.
- CI and examples:
  - The example runner fails on database setup or cleanup errors, and the HTTP example checks database visibility and fails on HTTP errors.
  - `scripts/check-file-links.mjs` and lychee `--include-fragments` check file references and anchors.
  - `scripts/check-shared-blocks.mjs` fails CI when the token blocks differ.

## [0.7.2] — 2026-09-29

### Fixed
- `installing.md` used Docker image names that don't exist. It now uses `influxdb:3-core` and `influxdb:3-enterprise`.
- `installing.md` said Core has no last-value or distinct-value caches. Core has both.

### Changed
- `installing.md` follows the docs for license flags and environment variables (`INFLUXDB3_LICENSE_*` in v3.11+), the `--object-store` requirement, cloud store flags, and the unauthenticated first-token window.
- `installing.md` names the other install methods (DEB/RPM packages, binaries, Docker Compose) and points to the docs and the identify-version pages.
- Removed `live_verified_against` from both `SKILL.md` files. A pinned version goes stale with every server release. `live_verified` stays, and `docs/publishing.md` says when to set the field.
- The Enterprise license instruction now says to give the full start command with placeholder email and type, and to ask for the real values before running it. It used to say to ask first, and some agents answered with a question and no command.
- The `/ping` authentication rule, including the `--disable-authz` opt-out from 3.10, now lives in `quirks.md` entry 1. Other files point to it.

## [0.7.1] — 2026-09-28

The first public release. The skills don't change.

### Changed
- Renamed the repo from `influxdata/influxdb3_skills` to `influxdata/influxdb3-skills`, so it matches the plugin name. GitHub redirects the old URL. The plugin and marketplace names don't change.
- The README opens with install steps, then sample prompts to try, and describes only what the skills do now.
- The README says the skills use the InfluxDB Documentation MCP server when it's connected. The server is hosted and needs only an OAuth login.
- `TESTING.md` is now a testing guide for contributors: validation, the version and link checks, workflow linters, unit tests, the runnable examples, and the evals.

### Removed
- The internal review material: reviewer briefings, the scorecard template, and old per-run result files.

## [0.7.0] — 2026-09-28

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
- `clients/python.md` shows automatic batching: pass `WriteOptions` through `write_client_options()`. The client ignores `write_options=` passed to `InfluxDBClient3` and `batch_size` placed in `write_client_options()`, so that code doesn't batch.
- `clients/csharp.md` says `InfluxDB3.Client` has no batching or retry options, so generated code builds fixed-size batches and retries 429 and 5xx responses.
- When a user pastes a token, the skill gives both the command that creates the replacement and the command that deletes the leaked token.

### Changed
- Both skills drop verification history (build dates, "verified against" notes, and "per source" notes) and skill-version roadmap references (`v0.x`).
  Version-support notes stay, written as `X+` (for example, `3.10+`).
- The SKILL.md performance-tuning deferral covers workload-specific batch-size tuning, not basic batching.
- Added a release-gate workflow that runs the eval suite on Claude Code and Codex and scores it with `evals/gate.mjs` (ADR-0002).
- Removed `TRY-IT.md`. Its sample prompts are in the README's "Use it" section.

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
- **Plugin write API**: skill content now teaches `influxdb3_local.write_sync(line, no_sync=True)` as the preferred plugin-write pattern instead of the legacy `influxdb3_local.write(line)`. Confirmed by introspecting the live Enterprise 3.8.4 binary, the runtime itself labels `write` and `write_to_db` as **legacy** in their own docstrings:
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
