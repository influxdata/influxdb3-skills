# Troubleshooting & Debugging — App + Admin

When something stopped working. Symptom-keyed at the top; topic sections below. For non-obvious behaviors that aren't really "broken" (just confusingly designed), see `references/quirks.md`. For plugin-runtime troubleshooting, see the sibling skill at `skills/influxdb3-plugins/references/troubleshooting.md`.

> Verified against InfluxDB 3 Enterprise 3.8.4 on 2026-05-08. For Cloud Serverless / Cloud Dedicated, signals may differ — see `references/flavors.md`.

## Token redaction rule

**If the customer pastes a real-looking token in their error message or logs (regex `apiv3_[A-Za-z0-9_-]{30,}`):**

1. Acknowledge the leak: *"Your error includes a real-looking token. Treat it as compromised — revoke and rotate immediately before continuing."*
2. Point at the rotation pattern in `references/tokens.md` → "Token rotation pattern".
3. **Never echo any portion of the token** in any response. Not the full string. Not the first 8 characters. Not the last 4. Not an `apiv3_…` truncation. Refer to it only as "the token in your error" or `<redacted>`. The bare `apiv3_` prefix alone is fine for explanation; anything after it is off-limits.
4. Then, with the token redacted, proceed to diagnose the underlying error.

**Why this matters:** even a token prefix is a fingerprint that helps an attacker correlate logs. The fact that the customer already pasted it doesn't lower the bar — quoting it back persists the leak in another place.

## Symptom → section

| Symptom | Section |
|---|---|
| HTTP 401 from any operation | [Auth failures](#auth-failures) |
| HTTP 403 from any operation | [Auth failures](#auth-failures) |
| Connection refused / DNS failure | [Auth failures](#auth-failures) |
| Write returns 200/204 but data isn't where I expect | [Silent auto-create misroute](#silent-auto-create-misroute) |
| Write fails with 400 (line protocol parse) | [Write failures](#write-failures) |
| Write succeeds but row count grows wrong | [Silent auto-create misroute](#silent-auto-create-misroute) |
| Query returns 0 rows / wrong rows | [Query failures](#query-failures) |
| Query schema mismatch (`No field named X`) | [Query failures](#query-failures) |
| Token rotation broke my CI | [Admin failures](#admin-failures) |
| Orphan databases / tokens after a script crash | [Admin failures](#admin-failures) |
| Permission-string typo rejected | [Admin failures](#admin-failures) |
| `delete token` syntax error | `references/quirks.md` → entry 8 |
| Slow query / slow write | [Performance hints](#performance-hints) (deep analysis → `influxdb3-ops` skill) |
| Plugin trigger doesn't fire | sibling skill: `influxdb3-plugins/references/troubleshooting.md` |

## Auth failures

### HTTP 401 — `the request was not authenticated`

**Diagnose (in order):**

1. Is `INFLUXDB_TOKEN` set? `echo "${INFLUXDB_TOKEN:0:8}..."` should show the first 8 chars (typically `apiv3_`). (This is the developer truncating their own env var to verify it's loaded — it does NOT violate the redaction rule above, which only forbids echoing tokens pasted into Claude's input.)
2. Is the script reading from the right env var name? App code reads `INFLUXDB_TOKEN`; the `influxdb3` CLI reads `INFLUXDB3_AUTH_TOKEN`. See `quirks.md` entry 5.
3. Is the host correct? `curl -sS -i "$INFLUXDB_HOST/ping"` — should return 200 with `x-influxdb-build` header.
4. Was the token recently rotated? See [Token rotation aftermath](#token-rotation-aftermath).
5. Is the token still valid? Run the diagnostic toolkit (`examples/diagnose/diagnose.py`) — it reports token validity.

**Fix:** correct env var name; load `.env` if missing; rotate if compromised.

### HTTP 403 — auth valid but lacks scope

**Diagnose:** the token is valid but doesn't have the operation's required permissions. Common cases:

- Application token (scoped) trying to do admin operations (create DB, create token). Use the admin token for admin work.
- Admin token (with `*:*:*`) being used at the data plane unnecessarily. See `quirks.md` and `references/tokens.md` → "Adversarial scenarios" — the admin token at the data plane is a foot-gun even when it works.
- Permission scoped to a different database than you're writing to. Check `system.tokens.permissions` (remember the JSON-string parsing — `quirks.md` entry 4).

**Fix:** create a scoped token with the right permissions for the operation. Reference: `references/tokens.md`.

### HTTP 404 — host

**Diagnose:** `curl -sS -i "$INFLUXDB_HOST/ping"` returns 404 instead of 200, OR connection times out / refuses.

- Wrong host URL (typo, wrong port).
- Server isn't running.
- For health-check tools using `HEAD /ping`: known quirk — only GET works (`quirks.md` entry 1).

**Fix:** correct the URL; start the server; switch the health check to GET.

## Silent auto-create misroute

**Symptom:** A write returned 200/204 success. A query against the database name you intended returns 0 rows, or stale rows. The data went to a *different* database with a similar name.

**Why:** v3 silently auto-creates databases on first write (default config). A typo in `INFLUXDB_DATABASE` becomes a brand-new database with that typo'd name; the original keeps growing nothing.

**Diagnose:** list every database the token can see — there is no SQL `system.databases` table for this; you have to use the admin surface.

```bash
# CLI
influxdb3 show databases --token "$INFLUXDB_TOKEN"

# Or HTTP API
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  "$INFLUXDB_HOST/api/v3/configure/database?format=json"
```

Look for typo'd siblings of your target name (`sensor_data` next to `sensors`; `senor_data` next to `sensor_data`).

```bash
# Find which database has your data
for db in <suspected-typo-1> <suspected-typo-2> <correct-name>; do
  echo "=== $db ==="
  influxdb3 query -d "$db" --token "$INFLUXDB_TOKEN" \
    "SELECT count(*) FROM <table>"
done
```

**Fix:**

1. Identify which DB has the data and which DB the writes *should* go to.
2. Fix the env var or code typo so future writes target the correct name.
3. (Optional) migrate the data from the typo'd DB to the correct one — copy out via SQL `SELECT *`, write back as line protocol.
4. Drop the typo'd DB: `influxdb3 delete database <typo_name> --token "$INFLUXDB_TOKEN"` (no `--force` — see `quirks.md` entry 7).

**Prevention:** SKILL.md §2 "First-time setup checklist" requires verifying the database exists before generating any write code. Generated app code should include a startup check.

## Write failures

### 400 — line protocol parse error

**What you'll see:**

```
{"error":"partial write of line protocol occurred","data":[{"error_message":"...","line_number":347,"original_line":"sensor,host=server01 temp 70.0 ..."}]}
```

**Critical: a 400 from a write rejects the WHOLE batch**, not just the bad line. The 999 valid lines beside line 347 also did NOT write. See `quirks.md` entry 11.

**Diagnose:**

- Read the `error_message` and `line_number` from the response. Common causes: missing space between tag set and field set, missing field value (e.g., `temp 70.0` should be `temp=70.0`), unquoted string in field value, integer/float type confusion (`temp=70` vs `temp=70i` vs `temp=70.0`).
- For a large batch where the error response only names the first bad line, split the batch in half, retry each half — converges on the bad rows in O(log n).

**Fix:** correct the line protocol; pre-validate client-side before sending in production.

### 413 — payload too large

**Diagnose:** batch size exceeds the server's per-request limit. Smaller default than you'd expect for some Cloud configurations.

**Fix:** reduce batch size. Recommended: 1,000–10,000 points per write call (matches the v0.1.0 batching rule in `references/writing.md`).

### 429 — rate limited

**Diagnose:** Cloud Serverless rate-limits writes per organization. Self-hosted Core/Enterprise typically does not unless you've configured it.

**Fix:** retry with exponential backoff and jitter. Documented in `references/writing.md` → "Error handling".

### 5xx — server-side

**Diagnose:** Server is overloaded or experiencing an internal error. Read path may still work while writes hang.

**Fix:** retry with exponential backoff. If it persists across multiple minutes, restart the server (self-hosted) or open a support ticket (Cloud).

### Schema-type stickiness

**What you'll see:** First write set `temp` as a float (`temp=72.4`); a later write tries `temp="unknown"` (string) and gets rejected.

**Why:** A field's type is set on the first successful write to that measurement. Switching the type later requires either a different field name or a recreate of the measurement.

**Fix:** use a different field name (`temp_str` instead of `temp`), or drop and recreate the measurement.

## Query failures

### 0 rows returned

**Diagnose (in order):**

1. **Is the data in the database you're querying?** Almost always: silent-auto-create misroute. Jump to that section first.
2. **Is there a `WHERE time > now() - INTERVAL '...'` filter that excludes everything?** v3 SQL queries against time-series data without a time filter scan the entire range; with a too-tight filter, scan zero. Try `SELECT count(*) FROM <table>` (no WHERE) to confirm data exists.
3. **Is the measurement name correct?** Case-sensitive, and SQL reserved words can't be measurement names without quoting.
4. **Are the tag/field values what you expect?** `SELECT DISTINCT host FROM <table> LIMIT 10` to see what's actually there.

**Fix:** correct the database / measurement / WHERE filter as appropriate.

### Schema mismatch (`No field named X`)

**Diagnose:** the field name in the query doesn't match the measurement's schema. Most common case is the v0.4.0 issue where someone queries `system.processing_engine_logs` with the wrong column names (see `quirks.md` entry 10).

**Fix:** check the actual schema:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = '<measurement>';
```

## Admin failures

### Token rotation aftermath

**Symptom:** Customer rotated a token an hour ago; CI started failing with 401 around the same time.

**Diagnose (in order):**

1. **Is the new token in the secret manager / env vars?** Check what the CI is actually loading.
2. **Did consumers restart?** Long-running services may still be using the old token until reconnect.
3. **Was the old token revoked too early?** If the swap-secret step was skipped, every consumer is on the old (now-deleted) token.

**Fix:** roll back the rotation if the old token still exists in the system; if it's been revoked, push the new token to all consumers and restart. Document the safe rotation order from `references/tokens.md` → "Token rotation pattern" — *create new → swap secret → restart consumers → revoke old*.

### Lost admin token

**Recovery options, easiest to hardest:**

1. **Operator token still available.** Use it: `influxdb3 create token --admin --regenerate --token "$OPERATOR_TOKEN"`.
2. **Operator token also lost, but server-side filesystem access available.** Stop the server, use the bootstrap mechanism (varies by deployment — check official docs). For Enterprise on a node you control, you can typically bootstrap a new operator token via filesystem auth.
3. **Both lost, no server-side access.** Contact InfluxData support. There is no purely-client-side recovery.

### Permission-string typo rejected

**What you'll see:** `influxdb3 create token --permission "db:my_db:reaad,write" ...` returns `Invalid permission`.

**Diagnose:** `read,write` typo'd to `reaad,write`. Other common typos: `db:` becoming `dbs:`, missing colons.

**Fix:** the format is `<resource_type>:<resource_names>:<actions>` where `resource_type` is `db` or `system`, and `actions` is `read`, `write`, or `read,write`. Reference: `references/tokens.md` → "Permission-string syntax".

### Retention period not applying

**What you'll see:** Set retention to `7d` on `--retention-period`, but data older than 7 days is still in the database.

**Diagnose:** Retention enforcement runs on a schedule (typically hourly), not instantly. Also: retention applies to *new* data only on some flavors; existing data outside the window may persist until the next compaction.

**Fix:** wait for the next retention sweep, or force compaction if your flavor supports it. For an immediate purge, drop and recreate the measurement (destructive). Enforcement-timing and compaction detail: the `influxdb3-ops` skill (`skills/influxdb3-ops/references/storage-and-compaction.md`).

### Orphan databases / tokens after a script crash

**Symptom:** Customer's provisioning script crashed mid-flow. They want to know what was created.

**Diagnose:**

```bash
# List databases with the test pattern
influxdb3 show databases --format json | python3 -c "
import json, sys
dbs = [d['iox::database'] for d in json.load(sys.stdin)]
print([d for d in dbs if d.startswith('<your-test-prefix>')])
"

# List tokens with the test pattern
influxdb3 show tokens --format json | python3 -c "
import json, sys
data = json.load(sys.stdin)
print([t['name'] for t in data if t['name'].startswith('<your-test-prefix>')])
"
```

**Fix:** delete each. The skill's admin examples (`examples/admin-*`) all use trapped cleanup specifically to prevent this.

## Performance hints

Slow queries, slow writes, cardinality remediation, batch-size tuning — deep coverage lives in the `influxdb3-ops` skill (`skills/influxdb3-ops/references/performance.md` and `cardinality.md`). Quick triage:

- **Slow query, no time filter** → add `WHERE time > now() - INTERVAL '...'`. Almost always fixes it.
- **Slow query, unbounded `SELECT *`** → add `LIMIT <n>`. v0.1.0's `querying.md` covers this.
- **Slow write, large batches** → split into 1,000–10,000-point batches per write call.
- **High cardinality** → in InfluxDB 3 there is **no hard cardinality limit and no "series cardinality exceeded" error** (unlike v1/v2). High cardinality costs memory and query time, not a rejected write. Design guidance: `references/schema-design.md`. Server-side detection/remediation and the real limits (max databases/tables/columns): the `influxdb3-ops` skill (`skills/influxdb3-ops/references/cardinality.md`).

For deeper analysis, use the `influxdb3-ops` skill. Do not try to debug query plans, batching strategy, or cardinality remediation in this skill.

## Where to fetch more

- `references/quirks.md` for "this is just how it is" cases
- `references/connecting.md` for the auth setup / .env / gitignore baseline
- `references/tokens.md` for the rotation pattern
- `references/databases.md` for DB lifecycle
- `references/admin-http-api.md` for HTTP wire format
- Sibling skill at `skills/influxdb3-plugins/references/troubleshooting.md` for plugin-runtime issues
