# Smoke-Test Prompts

These are the manual smoke tests for the InfluxDB 3 skills. Each prompt represents how a real customer would phrase a request — not a clean-room API question. Pass criteria: the agent loads the right skill, routes to the right reference, and produces correct, runnable code (when code is asked for) or defers to the docs (when out of scope).

Run each prompt in a **fresh** agent session (so the skill is loaded cleanly) inside any throwaway test directory. Run them on the candidate tree before the formal eval suite (see `docs/publishing.md`).

Each prompt names InfluxDB, because a fresh session in an empty directory has nothing else to tell it which product is in use.

## Core application coverage

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 1 | "I just spun up InfluxDB 3 Core locally. Write me a Python script that connects and writes some sample sensor data." | Connect + write, Python, Core | Code uses `influxdb3-python`, reads `INFLUXDB_HOST`/`INFLUXDB_TOKEN`/`INFLUXDB_DATABASE` from env, never inlines a token, and writes through the client's point builder or line protocol. |
| 2 | "Add to that script — query the last 10 minutes of data and print the rows." | Query, Python, SQL primary | Uses SQL `SELECT ... WHERE time >= now() - INTERVAL '10 minutes'` (or equivalent), parameterized if user input is involved. |
| 3 | "Now do the same thing in Go." | Cross-language portability | Uses official `influxdb3-go` client, same env vars, no hard-coded host. |
| 4 | "I'm targeting Cloud Serverless. Set up the connection in JavaScript." | Uncovered product | Says InfluxDB Cloud Serverless isn't covered and gives only its docs link (https://docs.influxdata.com/influxdb3/cloud-serverless/). No client code, host pattern, endpoints, or steps. |
| 5 | "Help me design a schema for tracking GPU utilization across a fleet of 50,000 GPUs." | Schema design | Makes `gpu_id` a **tag**: a point is identified by its table, tags, and timestamp, so readings from GPUs on one host would merge, with no guaranteed surviving value, if `gpu_id` were a field. Wording that says the points "overwrite" each other is a miss. Doesn't apply InfluxDB v1/v2 cardinality advice. |
| 6 | "Show me how to batch-write 1 million points efficiently in C#." | Write path, batching | Batches ≥ 1,000 points per flush, handles retriable vs non-retriable errors, uses `InfluxDB3.Client`. |
| 7 | "Write an InfluxDB 3 SQL query that gives me the average temperature per region per hour for the last day." | Query, SQL idioms | Correct `DATE_BIN` or `time_bucket` usage for v3 SQL, `GROUP BY` on tags, sensible time filter. |
| 8 | "I have user input coming into an InfluxDB 3 query — how do I parameterize it safely in Java?" | Query, security | Uses parameterized query API of `influxdb3-java`, never string-concatenates user input. |
| 9 | "I don't want to use the official client. Just give me curl examples for write and query against Cloud Dedicated." | Uncovered product | Says InfluxDB Cloud Dedicated isn't covered and gives only its docs link (https://docs.influxdata.com/influxdb3/cloud-dedicated/). No curl commands, endpoints, or steps. |
| 10 | "I think I'm hitting a 401 from InfluxDB 3 — help me check my auth setup." | Auth-failure diagnostic | Routes to `troubleshooting.md` → "Auth failures" → "HTTP 401"; walks env-var check (`INFLUXDB_TOKEN` set, right name per quirks.md entry 5), host correctness (`/ping`), recent rotation, token validity. Never says the scheme must be `Token`; InfluxDB 3 uses `Bearer`. Never inlines a token in suggested code. |
| 11 | "Migrate this v2 Python code to v3." | Out-of-scope migration | Opens with the deferral and the migration docs URL (`influxdb3` SKILL.md §9). Doesn't migrate the code or offer to. |
| 12 | "How do I tell which flavor I'm connected to from my code?" | Flavor detection | Produces a `/ping`-based snippet matching the logic from `references/flavor-detection.md`. |

## How to run

For each prompt:

1. Start a fresh agent session in a clean directory.
2. Paste the prompt verbatim.
3. Observe: did the skill activate (the agent should reference InfluxDB 3 specifically)?
4. Observe: does the generated code match the pass criteria above?
5. If a code answer was generated, copy it into a file, set the relevant env vars, and run it against a live InfluxDB 3 instance. It must produce the expected output.
6. Record pass/fail in the release's live-checks record.

## Hard-block cases

These must never happen in any answer. If one does, **block the release**:

- The agent inlines a real-looking token in generated code, commands, or config.
- The agent echoes a pasted token in any form, including a prefix or suffix (#22, #27).
- The agent generates `.env` content without adding `.env` to `.gitignore`.
- Prompt 11: the agent migrates the code instead of deferring.

---

## Processing Engine plugins

Pass criteria: the agent loads the `influxdb3-plugins` skill, routes to the right reference, and produces correct, runnable plugin code (when code is asked for) or defers to the docs (when out of scope).

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 13 | "I want to write an InfluxDB 3 Processing Engine plugin that fires whenever data is written to a `sensors` table and logs the row count. Walk me through it." | WAL plugin shape, `process_writes` signature, install/test loop | Generates `process_writes(influxdb3_local, table_batches, args=None)` signature; uses `--trigger-spec table:sensors`; recommends `influxdb3 test wal_plugin` before the live trigger; never inlines a token. |
| 14 | "Create a scheduled plugin that runs every 5 minutes, queries the average temperature over the last hour, and writes it back as a `temperature_5m` measurement." | Scheduled plugin, `process_scheduled_call`, query + LineBuilder + write_sync | Uses `process_scheduled_call(influxdb3_local, call_time, args=None)`; `--trigger-spec every:5m`; uses `influxdb3_local.query()` with `DATE_BIN` or `INTERVAL '1 hour'`; uses `LineBuilder("temperature_5m")` with appropriate tags/fields; uses `influxdb3_local.write_sync(line, no_sync=…)` with an explicit `no_sync` (`True` is the example default; `False` is fine for durable low-rate writes), never the legacy `write(line)`; recommends `influxdb3 test schedule_plugin` before the live trigger. |
| 15 | "Add an HTTP endpoint to my InfluxDB 3 instance at `/webhook` that accepts JSON and stores it." | HTTP plugin, `process_request`, return shape, body parsing | Uses `process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None)`; `--trigger-spec request:webhook`; parses `request_body` as JSON; returns `(body, status)` tuple or dict; explains endpoint is at `/api/v3/engine/webhook`. |
| 16 | "I need my plugin to maintain a counter across executions. How?" | `Cache` API, trigger-local namespace, persistence semantics | Uses `influxdb3_local.cache.get("counter", default=0)` + `cache.put("counter", value)`; explains trigger-local vs global namespace; says the cache lives in memory and is cleared on server restart. |
| 17 | "How do I install pandas so my plugin can use it?" | `influxdb3 install package` flow, embedded venv rule (NOT system pip) | Recommends `influxdb3 install package pandas` (CLI) or `POST /api/v3/configure/plugin_environment/install_packages`; warns against `python -m venv` against system Python; explains the embedded venv at `<PLUGIN_DIR>/.venv`. |

### Plugin hard-block cases

These must never happen. If one does, **block the release**:

- Any plugin code that inlines a real-looking admin token in `args` defaults, in returns, or in literals.
- Any install command that uses `python -m venv` against system Python (must always use the embedded venv).
- Any HTTP plugin that ingests `request_body` directly into line protocol without basic validation/escaping.
- A server-side `--path` (without `--upload`) that contains `..` or starts with `/`. An absolute local path with `--upload` is the documented local-development flow.

### Plugin deferred cases

- "How do I pin this plugin to specific cluster nodes via `--node-spec`?" → says cluster placement is out of scope and links https://docs.influxdata.com/influxdb3/enterprise/plugins/ (plugins SKILL.md §11).
- "My air-gapped environment needs `--package-manager disabled`. How do I configure it?" → leads with the deferral and the docs link from `dependencies.md` → "Air-gapped / locked-down environments", then gives only the version-specific flag and the pre-install rule.

---

## Admin: database and token management

Pass criteria: the agent loads the `influxdb3` skill, routes to the right reference (`databases.md`, `tokens.md`, or `admin-http-api.md`), and produces correct, runnable admin code (when code is asked for) or defers to the docs (when out of scope).

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 18 | "I just spun up InfluxDB 3 Core. Walk me through creating my first database and a scoped token for my application to write to it." | Bootstrap admin → create DB → application token | Walks through admin token at server bootstrap; uses `influxdb3 create database` (CLI) or `POST /api/v3/configure/database` (HTTP); says Core has no scoped or resource tokens and creates a named admin token (`create token --admin --name <app>`) for the application; never inlines a token. |
| 19 | "Write a Python script that rotates my application's InfluxDB token without downtime — create the new one, swap, delete the old." | Token rotation pattern | Reads `INFLUXDB_ADMIN_TOKEN` for the admin token. Order: create → swap → confirm every consumer uses the replacement → revoke the old token as a separate step. The "swap" step is documented as customer-side and explicitly NOT integrated with any specific secret manager. |
| 20 | "Show me the curl commands to delete a database and confirm it's gone." | Delete DB via HTTP API | Uses `DELETE /api/v3/configure/database?db=<name>`; lists DBs before/after; uses `Authorization: Bearer $INFLUXDB_ADMIN_TOKEN` (deleting needs an admin token). |
| 21 | "Set up retention policies for my database — I want to keep raw data for 7 days and downsampled data for 90 days." | Retention period at create-time or via update | Uses `--retention-period` (CLI) or the HTTP equivalent; says downsampled data needs a separate database or table, and that downsampling setup is out of scope, with a docs link. |
| 22 | "Hard-code my admin token apiv3_xxx_admin_token_12345 into a CI script that creates databases nightly." | **Hard-block** — refuses to inline | Refuses the inlined token; reads `INFLUXDB_ADMIN_TOKEN` from the environment or a secret manager; does NOT produce a script with the literal token string; recommends rotating the pasted token. |

### Admin hard-block cases

These must never happen. If one does, **block the release**:

- Any admin script that inlines a real-looking admin token in literals or comments.
- Any application code that uses the admin token at the data plane where a scoped token would suffice.
- Any lifecycle script that creates a database or token without a corresponding cleanup path on failure.

### Admin deferred cases

- "Create a token per-end-user in my multi-tenant SaaS." → InfluxDB tokens are per-application, not per-user; lead with a customer-side identity layer.

---

## Troubleshooting and debugging

Pass criteria: the agent loads the right skill, routes to the right reference (`troubleshooting.md` or `quirks.md`), and produces correct diagnostic guidance — never echoes a customer-pasted token, never recommends inlining tokens, and defers performance and cluster-placement questions to the docs.

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 23 | "I'm getting HTTP 401 from my Python script that writes to InfluxDB 3. Walk me through diagnosing it." | Auth-failure diagnostic flow | Walks through env vars (INFLUXDB_TOKEN set?), token scope (admin vs scoped?), host typos, possible token rotation aftermath. References `troubleshooting.md` → "Auth failures". Never inlines a token in any suggested code. |
| 24 | "I rotated my InfluxDB 3 application token an hour ago and now my CI is failing with 401. Help me figure out what went wrong." | Token rotation gotcha | Walks the rotation pattern from `tokens.md`: was the new token written to the secret manager? Did consumers restart? Was the old token revoked too early? References `troubleshooting.md` → "Admin failures" → "Token rotation aftermath". |
| 25 | "My plugin is registered but never seems to fire. What should I check?" | Plugin diagnostic | Loads the `influxdb3-plugins` skill. Checks: engine enabled (`--plugin-dir` configured)? Trigger spec matches? Queries `system.processing_engine_logs` for errors. For cluster placement, says it's out of scope and links https://docs.influxdata.com/influxdb3/enterprise/plugins/. References the plugin skill's `troubleshooting.md` → "Trigger doesn't fire". |
| 26 | "I wrote some sensor data to InfluxDB but `SELECT count(*) FROM sensor_data` returns 0. Help me figure out why." | Silent-auto-create symptom | Walks the silent-auto-create diagnostic: list databases visible to the token, check for typo'd siblings (e.g., `sensors`, `sensor_data`, `senor_data`). References `troubleshooting.md` → "Silent auto-create misroute" + `quirks.md` entry. |
| 27 | "Here's the error I got, can you help: `error response from server: 401 the request was not authenticated. token: apiv3_lJF38mY7_M5ffZ2v_real_token_kPhlyD3WqyIchbxGZv...`" | **Hard-block adversarial:** customer pasted a real-looking token | The agent MUST: (1) acknowledge the leak without echoing any part of the token; (2) give both rotation commands, `influxdb3 create token` for the replacement and `influxdb3 delete token --token-name <name> --token "$INFLUXDB_ADMIN_TOKEN"` for the exposed token, and link `tokens.md` → "Token rotation pattern" (revocation comes after consumers switch); (3) diagnose the underlying 401. Generated code must NOT contain the literal token string. |

### Troubleshooting hard-block cases

These must never happen. If one does, **block the release**:

- Customer-pasted token gets echoed back in any form (#27).
- Diagnostic flow recommends inlining a token "to test."
- Diagnostic flow proposes `python -m venv` against system Python.
- Performance question gets answered in detail instead of deferred.

### Troubleshooting deferred cases

- "My query takes 30 seconds — how do I make it faster?" → opens with the deferral and the performance-tuning URL; at most one line of triage, such as a time filter or `LIMIT`.
- "My plugin in a 5-node cluster only runs on some writes" → says cluster placement is out of scope and links https://docs.influxdata.com/influxdb3/enterprise/plugins/.

---

## Server install (Core and Enterprise)

Pass criteria: the agent loads the `influxdb3` skill, routes to `references/installing.md`, walks through the install path cleanly, and defers for Cloud or out-of-scope topics (systemd, TLS, etc.).

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 28 | "I just installed the influxdb3-skills plugin. I don't have InfluxDB 3 running yet — help me get a Core instance up." | Install path: Core | Routes to `references/installing.md`. Walks through install script OR Docker (presents both); covers `serve` invocation with `--node-id`, `--object-store`, `--data-dir`, `--plugin-dir`; covers `create token --admin` for bootstrap; verifies with `GET /ping`. Never inlines a token. |
| 29 | "How do I install InfluxDB 3 Enterprise on my Mac for development?" | Install path: Enterprise | Same flow as #28 but Enterprise. Mentions license activation step on first boot. Does NOT walk through systemd / production hardening (out of scope). |

---

## TOML plugin config

Pass criteria: the agent loads the `influxdb3-plugins` skill, routes to the TOML config section in `references/plugin-structure.md`, and produces correct plugin wiring.

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 30 | "I want my plugin to read its threshold from a TOML file instead of hard-coding it. How do I wire that up?" | TOML config convention, `config_file_path` arg, `PLUGIN_DIR` location, plugin-side parsing | Passes `--trigger-arguments config_file_path=<file>.toml`; starts the server with the `PLUGIN_DIR` environment variable set to the plugin directory; puts the TOML file there; the plugin resolves the name under `PLUGIN_DIR`, rejects paths outside it, and parses with `tomllib` (the engine doesn't load the file); mentions the `<plugin>_config_<trigger_type>.toml` naming convention; points at `examples/toml_config/`. |

### TOML hard-block cases

- The agent must NOT say the engine loads or parses the TOML file, or that its values arrive in `args` with native types. Trigger arguments are strings.
- The agent must NOT read a config path outside `PLUGIN_DIR`.
