# Smoke-Test Prompts

These are the manual smoke tests for the InfluxDB 3 skill. Each prompt represents how a real customer would phrase a request — not a clean-room API question. Pass criteria: Claude triggers the `influxdb3` skill, routes to the right reference, and produces correct, runnable code (when code is asked for) or defers politely (when out of scope).

Run each prompt in a **fresh** Claude Code session (so the skill is loaded cleanly) inside any throwaway test directory.

## v1 scope coverage

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 1 | "I just spun up InfluxDB 3 Core locally. Write me a Python script that connects and writes some sample sensor data." | Connect + write, Python, Core | Code uses `influxdb3-python`, reads `INFLUXDB_HOST`/`INFLUXDB_TOKEN`/`INFLUXDB_DATABASE` from env, never inlines a token, uses line protocol. |
| 2 | "Add to that script — query the last 10 minutes of data and print the rows." | Query, Python, SQL primary | Uses SQL `SELECT ... WHERE time >= now() - INTERVAL '10 minutes'` (or equivalent), parameterized if user input is involved. |
| 3 | "Now do the same thing in Go." | Cross-language portability | Uses official `influxdb3-go` client, same env vars, no hard-coded host. |
| 4 | "I'm targeting Cloud Serverless. Set up the connection in JavaScript." | Flavor switch, JS/TS | Uses `@influxdata/influxdb3-client`, points at the Cloud Serverless host pattern, notes the v2 write path for Serverless if relevant. |
| 5 | "Help me design a schema for tracking GPU utilization across a fleet of 50,000 GPUs." | Schema design, cardinality | Calls out that GPU ID should be a **field** (not a tag) due to cardinality; tags reserved for low-cardinality grouping like `region` or `gpu_model`. |
| 6 | "Show me how to batch-write 1 million points efficiently in C#." | Write path, batching | Batches ≥ 1,000 points per flush, handles retriable vs non-retriable errors, uses `InfluxDB3.Client`. |
| 7 | "Write a SQL query that gives me the average temperature per region per hour for the last day." | Query, SQL idioms | Correct `DATE_BIN` or `time_bucket` usage for v3 SQL, `GROUP BY` on tags, sensible time filter. |
| 8 | "I have user input coming into a query — how do I parameterize it safely in Java?" | Query, security | Uses parameterized query API of `influxdb3-java`, never string-concatenates user input. |
| 9 | "I don't want to use the official client. Just give me curl examples for write and query against Cloud Dedicated." | HTTP fallback, Cloud Dedicated | Uses raw `/api/v3/write_lp` (or correct flavor endpoint) and `/api/v3/query_sql`, env vars for host and token. |
| 10 | "I think I'm hitting a 401 — help me check my auth setup." | Out-of-scope troubleshooting | Defers politely: explains this skill covers connect/write/query/schema; suggests checking env vars and that troubleshooting is a future addition. |
| 11 | "Migrate this v2 Python code to v3." | Out-of-scope migration | Defers politely; does not pretend to be a migration helper. |
| 12 | "How do I tell which flavor I'm connected to from my code?" | Flavor detection | Produces a `/ping`-based snippet matching the logic from `references/flavor-detection.md`. |

## How to run

For each prompt:

1. Start a fresh Claude Code session in a clean directory.
2. Paste the prompt verbatim.
3. Observe: did the skill activate (Claude should reference InfluxDB 3 specifically)?
4. Observe: does the generated code match the pass criteria above?
5. If a code answer was generated, copy it into a file, set the relevant env vars, and run it against a live InfluxDB 3 instance. It must produce the expected output.
6. Record pass/fail in `evals/results/smoke-<date>.md`.

## Hard-block cases

These prompts must NEVER produce the wrong output. If they do, **block release**:

- Any prompt where Claude inlines a real-looking token in generated code.
- Any prompt where Claude generates `.env` content and forgets to add `.env` to `.gitignore`.
- Prompt 10 or 11: Claude must defer, not invent a v2-migration or troubleshooting answer.

---

## v0.2.0 scope coverage — Processing Engine plugins

Run each prompt in a **fresh** Claude Code session inside a throwaway directory. Pass criteria: Claude triggers the `influxdb3-plugins` skill, routes to the right reference, and produces correct, runnable plugin code (when code is asked for) or defers politely (when out of scope for v0.2.0).

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 13 | "I want to write an InfluxDB 3 Processing Engine plugin that fires whenever data is written to a `sensors` table and logs the row count. Walk me through it." | WAL plugin shape, `process_writes` signature, install/test loop | Generates `process_writes(influxdb3_local, table_batches, args=None)` signature; uses `--trigger-spec table:sensors`; recommends `influxdb3 test wal_plugin` before live trigger; never inlines a token. |
| 14 | "Create a scheduled plugin that runs every 5 minutes, queries the average temperature over the last hour, and writes it back as a `temperature_5m` measurement." | Scheduled plugin, `process_scheduled_call`, query + LineBuilder + write | Uses `process_scheduled_call(influxdb3_local, call_time, args=None)`; `--trigger-spec every:5m`; uses `influxdb3_local.query()` with `DATE_BIN` or `INTERVAL '1 hour'`; uses `LineBuilder("temperature_5m")` with appropriate tags/fields; `influxdb3_local.write(...)`. |
| 15 | "Add an HTTP endpoint to my InfluxDB 3 instance at `/webhook` that accepts JSON and stores it." | HTTP plugin, `process_request`, return shape, body parsing | Uses `process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None)`; `--trigger-spec request:webhook`; parses `request_body` as JSON; returns `(body, status)` tuple or dict; explains endpoint is at `/api/v3/engine/webhook`. |
| 16 | "I need my plugin to maintain a counter across executions. How?" | `Cache` API, trigger-local namespace, persistence semantics | Uses `influxdb3_local.cache.get("counter", default=0)` + `cache.put("counter", value)`; explains trigger-local vs global namespace; mentions cache cleared on server restart. |
| 17 | "How do I install pandas so my plugin can use it?" | `influxdb3 install package` flow, embedded venv rule (NOT system pip) | Recommends `influxdb3 install package pandas` (CLI) or `POST /api/v3/configure/plugin_environment/install_packages`; warns against `python -m venv` against system Python; explains the embedded venv at `<PLUGIN_DIR>/venv`. |

### v0.2.0 hard-block cases

These prompts must NEVER produce the wrong output. If they do, **block the v0.2.0 release**:

- Any plugin code that inlines a real-looking admin token in `args` defaults, in returns, or in literals.
- Any install command that uses `python -m venv` against system Python (must always use the embedded venv).
- Any HTTP plugin that ingests `request_body` directly into line protocol without basic validation/escaping.
- Any plugin upload command using a `--path` containing `..` or starting with `/` (path traversal protection must be respected).

### v0.2.0 deferred cases (must defer politely)

- "How do I pin this plugin to specific cluster nodes via `--node-spec`?" → defer to v0.2.1 (cluster placement is the v0.2.1 scope).
- "My air-gapped environment needs `--package-manager disabled`. How do I configure it?" → defer to v0.3.0+ (air-gapped setup).
