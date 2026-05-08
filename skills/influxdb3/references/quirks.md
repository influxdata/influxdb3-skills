# InfluxDB 3 Quirks — Non-obvious Behaviors

A catalogue of behaviors that aren't in the official docs but customers will hit. Each entry: **What you'll see → Why it's that way → What to do.** Entries are bounded — only quirks that are (a) verified against a real release, (b) genuinely non-obvious, (c) likely to be hit in a customer's first month.

> Verified against InfluxDB 3 Enterprise 3.8.4 on 2026-05-08. Cloud-flavor quirks may differ — see flavor-specific notes per entry.

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

## 6. Resource-token endpoint differs Core vs Enterprise

**What you'll see:** A `POST /api/v3/configure/token` succeeds on Core but returns 404 on Enterprise (or vice versa).

**Why:**
- **Core** uses `POST /api/v3/configure/token` for resource tokens.
- **Enterprise** uses `POST /api/v3/enterprise/configure/token` for resource tokens (different path).
- Admin token creation, delete-token, and database CRUD endpoints are identical on both.

**What to do:** Detect the flavor (`references/flavor-detection.md`) before generating admin code. Examples in `examples/admin-*` target Enterprise; the README in each example notes the one-line swap for Core.

---

## 7. `delete database` has no `--force` flag

**What you'll see:** Generated CLI code with `influxdb3 delete database <name> --force` errors with `error: unexpected argument '--force' found`.

**Why:** Deletion is non-interactive by default — there is no confirmation prompt, so no need for `--force`. (Other commands like `delete trigger` DO have `--force`; this is asymmetric.)

**What to do:** Drop the `--force`. Use `--hard-delete <when>` (`never` / `now` / `default` / `<timestamp>`) or `--data-only` for advanced cases. Pattern documented in `references/databases.md`.

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

**Why:** The actual columns are `event_time` (timestamp), `trigger_name` (string), `log_level` (`INFO` / `WARN` / `ERROR` uppercase), `log_text` (string). The `time / plugin_name / level / message` names came from older docs that drifted.

**What to do:** Use the verified column names. Reference: `skills/influxdb3-plugins/references/testing.md` → "Reading plugin logs".

```sql
SELECT event_time, log_level, log_text FROM system.processing_engine_logs
WHERE trigger_name = 'my_trigger'
ORDER BY event_time DESC LIMIT 50;
```

---

## 11. 400 from a write rejects the **whole batch**, not just the bad line

**What you'll see:** A batch of 1,000 line-protocol points returns `400 Bad Request` because line #347 has a parse error. The other 999 valid lines were NOT written.

**Why:** v3's write endpoint validates the whole payload before committing any of it. One malformed line aborts the entire request.

**What to do:** Either pre-validate line protocol client-side, or implement split-and-retry on 400 to find the bad row. The error response usually names the offending line. Documented in `references/writing.md` → "Error handling".

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
