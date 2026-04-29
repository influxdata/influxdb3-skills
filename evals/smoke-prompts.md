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
