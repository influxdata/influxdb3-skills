# InfluxDB 3 Quirks — Non-obvious Behaviors

A catalogue of behaviors that aren't in the official docs but customers will hit. Each entry: **What you'll see → Why it's that way → What to do.** Entries are bounded — only quirks that are (a) verified against a real release, (b) genuinely non-obvious, (c) likely to be hit in a customer's first month.

> Quirks can differ on InfluxDB 3 Cloud, InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered — see flavor-specific notes per entry.

---

## 1. `HEAD /ping` returns 404; only `GET /ping` works

**What you'll see:** Health-check tools that probe with `HEAD` (e.g., `curl -I /ping`, some monitoring agents) report the server as down.

**Why:** The `/ping` route is registered for GET only on Core and Enterprise.

**What to do:** Use `GET` for `/ping` health checks. Documented in `references/flavor-detection.md`.

---

## 2. Silent auto-create on first write

**What you'll see:** A write to a database name that doesn't exist returns 200/204 success. The data lands in a brand-new database with that exact (possibly typo'd) name. The DB you intended to write to keeps growing nothing.

**Why:** Default config auto-creates databases on first write. The auto-create is a UX feature for getting started fast; it becomes a footgun when env vars typo or scripts drift.

**What to do:** Verify the database exists before the first write. Diagnostic + recovery flow in `references/troubleshooting.md` → "Silent auto-create misroute". Generated code that creates a `.env` for production should include a startup check that lists databases and aborts on mismatch.

---

## 3. `table_batches` items are dicts, not class instances

**What you'll see (in plugin code):** `for batch in table_batches: batch.rows` raises `AttributeError: 'dict' object has no attribute 'rows'`.

**Why:** The runtime hands plain dicts to `process_writes(...)`, even though some upstream type docs describe a `TableBatch` class. The dict has keys `"table_name"` (str) and `"rows"` (list of dicts).

**What to do:** Use dict access: `batch["table_name"]` and `batch["rows"]`. Each row is also a dict with all columns (tags, fields, time) keyed by column name. Time is a nanosecond integer.

```python
def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        table_name = batch["table_name"]   # NOT batch.table_name
        rows = batch["rows"]               # NOT batch.rows
        for row in rows:
            ts = row["time"]               # ns int
```

---

## 4. `system.tokens.permissions` is a JSON-encoded string

**What you'll see:** Code that does `for perm in row["permissions"]:` iterates over **characters** of a string instead of objects.

**Why:** The `permissions` column in `system.tokens` is stored as a JSON-encoded string like `"[\"db:gf_ha:read\", \"db:gf_ha:write\"]"`, not as a native array. The CLI rendering and JSON-API responses serialize it as a literal string.

**What to do:** `JSON.parse` (or `json.loads`) the column before iterating.

```python
import json
for row in system_tokens_rows:
    perms = json.loads(row["permissions"])   # now a list of short-form strings
    for perm in perms:
        # perm is e.g., "db:my_db:read,write"
        ...
```

---

## 5. `INFLUXDB_TOKEN` (skill convention) vs `INFLUXDB3_AUTH_TOKEN` (CLI env var)

**What you'll see:** A script sets `INFLUXDB_TOKEN` in env, then runs `influxdb3 ...` and gets `Failed to create token, error: ApiError { code: 401, message: "the request was not authenticated" }`.

**Why:** Two different conventions:
- **The skill's app-developer code uses `INFLUXDB_TOKEN`** (matches `INFLUXDB_HOST`, `INFLUXDB_DATABASE` — symmetric naming, all language clients honor it).
- **The `influxdb3` CLI reads `INFLUXDB3_AUTH_TOKEN`** (different name, prefixed with `INFLUXDB3_`).

**What to do:** Either set both env vars, or pass the token explicitly via `--token "$INFLUXDB_TOKEN"` on every CLI command (the skill's admin examples do this). Don't rely on env-var fallthrough for CLI work.

---

## 6. Resource-token creation fails on Core

**What you'll see:** On Core, a resource-token create request returns 404, or `influxdb3 create token --permission` is rejected.

**Why:** Core has admin tokens only. See `references/tokens.md` → "InfluxDB 3 Core: admin tokens only."

**What to do:** Detect the flavor (`references/flavor-detection.md`) before generating admin code. The `examples/admin-*` scripts require Enterprise or InfluxDB 3 Cloud.

---

## 7. `delete database` uses `-y`/`--yes` to skip the prompt — there is no `--force`

**What you'll see:** Two related surprises. (a) `influxdb3 delete database <name> --force` errors with `error: unexpected argument '--force' found` — that flag doesn't exist. (b) In a script / non-interactive shell (no TTY), a bare `influxdb3 delete database <name>` prints `Are you sure you want to delete "<name>"?` and then fails with `Delete command failed: Cannot proceed without confirmation` (exit 1).

**Why:** The CLI prompts for confirmation (3.10+); the flag to skip it is `-y`/`--yes`, not `--force`. The HTTP API `DELETE /api/v3/configure/database?db=<name>` has **no** prompt and is unaffected.

**What to do:** For scripting/automation, pass `-y` (or `--yes`): `influxdb3 delete database <name> -y --token "$INFLUXDB_TOKEN"`. Combine with `--hard-delete <when>` (`never` / `now` / `default` / `<timestamp>`) or `--data-only` for advanced cases. Pattern documented in `references/databases.md`. Or call the HTTP API, which never prompts.

---

## 8. `delete token` uses `--token-name` flag, not positional

**What you'll see:** `influxdb3 delete token <name>` returns `error: unexpected argument`.

**Why:** Unlike `delete database` (positional `<NAME>`), `delete token` requires the `--token-name <NAME>` flag. The signature differs because there's also a `--token <admin-token>` flag for authentication; positional would be ambiguous.

**What to do:** Use `influxdb3 delete token --token-name <name> --token "$INFLUXDB_TOKEN"`. No `--force` here either.

---

## 9. Plugin venv is bundled, system pip will fail

**What you'll see:** Plugin code that imports `pandas` raises `ImportError`, even though `pip install pandas` was run on the host.

**Why:** When the server starts with `--plugin-dir`, it creates a Python virtual environment at `<PLUGIN_DIR>/venv` using the **bundled Python interpreter** that ships with the `influxdb3` binary. Plugins run inside *that* venv, not the system Python.

**What to do:** Install packages with `influxdb3 install package <pkg>`. If you need a custom venv, chain off the bundled interpreter: `<PLUGIN_DIR>/venv/bin/python -m venv <new-venv>`. Never `python -m venv` against system Python and expect plugins to use it.

---

## 10. `system.processing_engine_logs` columns are `event_time / trigger_name / log_level / log_text`

**What you'll see:** A query `SELECT time, plugin_name, level, message FROM system.processing_engine_logs` returns `Schema error: No field named plugin_name`.

**Why:** The columns are `event_time` (timestamp), `trigger_name` (string), `log_level` (`INFO` / `WARN` / `ERROR` uppercase), and `log_text` (string).
`plugin_name`, `level`, and `message` aren't columns.
The physical timestamp column is named `time`, and `event_time` is a virtual alias for it (3.11.0+).
`event_time` works on every version, so the examples use it.

**What to do:** Use `event_time`, `trigger_name`, `log_level`, and `log_text`. Reference: `skills/influxdb3-plugins/references/testing.md` → "Reading plugin logs".

```sql
SELECT event_time, log_level, log_text FROM system.processing_engine_logs
WHERE trigger_name = 'my_trigger'
ORDER BY event_time DESC LIMIT 50;
```

---

## 11. A 400 from `/api/v3/write_lp` can still write most of the batch

**What you'll see:** A batch of 1,000 line-protocol points returns `400 Bad Request` because line #347 has a parse error.

**Why:** `/api/v3/write_lp` defaults to `accept_partial=true`.
InfluxDB writes the 999 valid lines and rejects line #347.
The response `data` array lists each rejected line.
With `accept_partial=false`, one invalid line rejects the whole batch.

**What to do:** Don't resend the whole batch after a partial write, because that duplicates the lines already stored.
Fix and resend only the lines listed in `data`.
The `/api/v2/write` and `/write` compatibility endpoints behave differently: on 3.11.5, one invalid line rejects the whole batch.
Documented in `references/writing.md` → "Error handling".

---

## 12. Permission strings: short-form (CLI / system.tokens) vs structured (HTTP body)

**What you'll see:** A POST to `/api/v3/enterprise/configure/token` with `"permissions": ["db:my_db:read,write"]` returns `400 serde json error: invalid type: string ..., expected struct PermissionDetailsApi`.

**Why:** Same permission, two encodings:
- **Short form** — `"db:<name>:<actions>"`. Used by the CLI's `--permission` flag and stored in `system.tokens.permissions`.
- **Structured form** — `{"resource_type": "db", "resource_names": ["<name>"], "actions": ["read", "write"]}`. Required by the create-token HTTP body.

**What to do:** Use the right encoding for the surface. Reference: `references/admin-http-api.md` → "Permission strings (CLI vs HTTP)".

```json
{
  "type": "resource",
  "token_name": "my_token",
  "permissions": [
    {
      "resource_type": "db",
      "resource_names": ["my_db"],
      "actions": ["read", "write"]
    }
  ]
}
```

---

## Where to fetch more

- App-side troubleshooting: `references/troubleshooting.md`
- Plugin-side troubleshooting: `skills/influxdb3-plugins/references/troubleshooting.md`
- Diagnostic toolkit: `examples/diagnose/`
- Broken→fix demo pairs: `examples/troubleshooting/`
