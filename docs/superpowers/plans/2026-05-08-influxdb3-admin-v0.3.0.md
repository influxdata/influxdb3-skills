# InfluxDB 3 Admin Skill Extension — v0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `influxdb3` skill (v0.1.x) to v0.3.0 with full admin coverage — database CRUD, token CRUD (admin and scoped), retention period configuration, and the rotation pattern — equally weighted across CLI and HTTP API surfaces, with end-to-end runnable examples in all six client paths (Python, JS, Go, Java, C#, HTTP/curl).

**Architecture:** New content extends the existing `skills/influxdb3/` skill in place — no third skill. Three new references (`admin-http-api.md`, `databases.md`, `tokens.md`) anchor the content; six new example folders under `examples/admin-<lang>/` exercise a 10-step token+DB lifecycle end-to-end against the live Enterprise 3.8.4 instance. SKILL.md gains §10 (Database management) and §11 (Token management); §9 deferred-topics list updates accordingly. The `influxdb3-plugins` skill is untouched.

**Tech Stack:** Markdown + YAML frontmatter for skill content; each language's standard HTTP library for admin examples (`requests` for Python, `node fetch` / `axios` for JS, `net/http` for Go, `java.net.http.HttpClient` for Java, `System.Net.Http.HttpClient` for C#, curl for HTTP); live InfluxDB 3 Enterprise 3.8.4 at `http://localhost:8181` for verification.

**Spec reference:** `docs/superpowers/specs/2026-05-08-influxdb3-admin-design.md`. Read it before starting — every reference doc and example is shaped by it.

**TDD adaptation for v0.3.0:**
- For runnable lifecycle examples: the test is "did the 10-step lifecycle complete cleanly, with no orphan databases or tokens left behind?" Real, executable verification against a live server, with a hard orphan check at the end.
- For skill content (`SKILL.md` and `references/`): the test is the smoke-prompt suite (Task 15). Smoke prompts #18–#22 are written first (Task 2) so they function as the test spec for the whole build.
- **Cleanup is non-negotiable.** Admin operations leave real working tokens and databases. Every example must use language-appropriate cleanup-on-error (`try/finally`, `trap EXIT`, `defer`); the verification step always grep-checks for `admin_test_*` orphans.

**Pre-flight checks before starting:**
- v0.1.0 + v0.2.0 are tagged: `git tag --list` shows `v0.1.0` and `v0.2.0`.
- Live InfluxDB 3 Enterprise 3.8.4 is running at `http://localhost:8181` with `--plugin-dir` configured.
- `INFLUXDB_HOST=http://localhost:8181`, `INFLUXDB_TOKEN=<admin token>`, `INFLUXDB_DATABASE=claude_skill_test` are exported. The token must be **admin/operator** since we need token+DB CRUD.
- `influxdb3` CLI binary is at `/Users/garyfowler/.influxdb/influxdb3` (3.8.4); add to PATH for live verification: `export PATH="/Users/garyfowler/.influxdb:$PATH"`.
- The existing `~/.claude/plugins/claude-influxdb3` symlink resolves to `~/Projects/claude-influxdb3`.
- Working directory: `~/Projects/claude-influxdb3/`. Working on master (continuation; same as v0.1.0/v0.2.0).
- **Important:** before starting, run an orphan check — confirm no `admin_test_*` databases or tokens are present from any earlier work. If any exist, delete them first.

---

## Phase 1: Bootstrap

### Task 1: Bump versions; update `influxdb3` SKILL.md frontmatter

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `skills/influxdb3/SKILL.md` (frontmatter only)

- [ ] **Step 1: Read the current `plugin.json`**

```bash
cat ~/Projects/claude-influxdb3/.claude-plugin/plugin.json
```

Confirm current `version` is `0.2.0`. The `skills` array should contain both `skills/influxdb3` and `skills/influxdb3-plugins`.

- [ ] **Step 2: Update `plugin.json`**

Bump `version` to `0.3.0` and update `description` to mention admin (DB + token management). Keep all other fields identical.

```json
{
  "name": "claude-influxdb3",
  "version": "0.3.0",
  "description": "Teach Claude Code to write correct InfluxDB 3 code (connect, write, query, schema design), to develop, install, and test Processing Engine plugins, and to provision and manage databases and auth tokens — across Core, Enterprise, Cloud Serverless, and Cloud Dedicated, in Python, JavaScript, Go, Java, C#, and raw HTTP.",
  "author": {
    "name": "Gary Fowler",
    "email": "garyfowler2015@gmail.com"
  },
  "license": "MIT",
  "skills": [
    "skills/influxdb3",
    "skills/influxdb3-plugins"
  ]
}
```

- [ ] **Step 3: Read the current `skills/influxdb3/SKILL.md` frontmatter**

```bash
head -25 ~/Projects/claude-influxdb3/skills/influxdb3/SKILL.md
```

Note: the existing frontmatter is folded-scalar-style `description: Use when ...` (no `description: |` literal block). Keep that style for consistency unless the YAML parser breaks — if it breaks, switch to `description: |` (literal block) like `influxdb3-plugins/SKILL.md`.

- [ ] **Step 4: Replace the frontmatter only**

Body sections (§1 onwards) stay untouched in this task. Replace ONLY the frontmatter (the lines between the two `---` markers) with:

```yaml
---
name: influxdb3
description: Use when the developer is writing or modifying code that connects
  to, reads from, writes to, or designs schemas for InfluxDB 3 (Core, Enterprise,
  Cloud Serverless, or Cloud Dedicated), OR when provisioning databases,
  creating, rotating, listing, or deleting auth tokens (admin tokens, operator
  tokens, scoped resource tokens with db colon name colon read,write
  permission strings), configuring retention periods, or automating any of the
  above via CLI or HTTP API. Triggers on imports of any official InfluxDB 3
  client (influxdb3-python, @influxdata/influxdb3-client, influxdb3-go,
  influxdb3-java, InfluxDB3.Client), references to line protocol, v3 SQL
  queries, or .env keys like INFLUXDB_HOST / INFLUXDB_TOKEN /
  INFLUXDB_DATABASE; AND admin keywords like influxdb3 create token,
  influxdb3 create database, influxdb3 show tokens, regenerate operator
  token, /api/v3/configure/token, and /api/v3/configure/database. Distinct
  from the influxdb3-plugins skill, which covers code that runs INSIDE
  InfluxDB.
version: 0.3.0
last_verified: 2026-05-08
verified_against:
  influxdb3_core: "3.8"
  influxdb3_enterprise: "3.8"
  influxdb3_python: "0.19"
  influxdb3_javascript: "2.2"
  influxdb3_go: "2.14"
  influxdb3_java: "1.9"
  influxdb3_csharp: "1.8"
---
```

> **Note:** the `db colon name colon read,write` phrasing in the description avoids YAML's `:` parsing pitfalls in folded scalars (the same class of issue that hit `influxdb3-plugins/SKILL.md` with `gh:`). If the YAML parser still chokes on this description, switch the whole field to `description: |` (literal block) and restore the natural punctuation.

- [ ] **Step 5: Verify YAML parses**

```bash
cd ~/Projects/claude-influxdb3
python3 -c "
import re, yaml
content = open('skills/influxdb3/SKILL.md').read()
m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
fm = yaml.safe_load(m.group(1))
assert fm['name'] == 'influxdb3'
assert fm['version'] == '0.3.0'
assert fm['last_verified'] == '2026-05-08' or 'admin' in fm['description'].lower()
print('OK:', fm['name'], fm['version'])
"
```

Expected: `OK: influxdb3 0.3.0`. If it fails, switch to `description: |` and re-verify.

- [ ] **Step 6: Verify `plugin.json` parses**

```bash
python3 -c "import json; m=json.load(open('.claude-plugin/plugin.json')); assert m['version'] == '0.3.0'; print('OK:', m['version'])"
```

Expected: `OK: 0.3.0`.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add .claude-plugin/plugin.json skills/influxdb3/SKILL.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "chore: bump influxdb3 skill to v0.3.0; admin keywords in description"
```

---

## Phase 2: Test spec first

### Task 2: Append 5 smoke prompts (#18–#22) to `evals/smoke-prompts.md`

**Files:**
- Modify: `evals/smoke-prompts.md` (append a new section)

The smoke prompts function as the test spec for the whole build. Write them BEFORE any reference/example content so future tasks have a clear target.

- [ ] **Step 1: Append the new section**

Open `~/Projects/claude-influxdb3/evals/smoke-prompts.md` and append the following section to the end. Do NOT modify any of the existing v0.1.0 or v0.2.0 content.

```markdown

---

## v0.3.0 scope coverage — Admin: database & token management

Run each prompt in a **fresh** Claude Code session inside a throwaway directory. Pass criteria: Claude triggers the `influxdb3` skill, routes to the right reference (`databases.md`, `tokens.md`, or `admin-http-api.md`), and produces correct, runnable admin code (when code is asked for) or defers politely (when out of scope).

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 18 | "I just spun up InfluxDB 3 Core. Walk me through creating my first database and a scoped token for my application to write to it." | Bootstrap admin → create DB → create scoped token | Walks through admin token at server bootstrap; uses `influxdb3 create database` (CLI) or `POST /api/v3/configure/database` (HTTP); creates a scoped token with `db:<name>:read,write`; never inlines a token. |
| 19 | "Write a Python script that rotates my application's InfluxDB token without downtime — create the new one, swap, delete the old." | Token rotation pattern | Order: create new → write to secret manager / env → revoke old. Reads `INFLUXDB_TOKEN` from env for the admin token. The "swap" step is documented as customer-side and explicitly NOT integrated with any specific secret manager. |
| 20 | "Show me the curl commands to delete a database and confirm it's gone." | Delete DB via HTTP API | Uses `DELETE /api/v3/configure/database?db=<name>` (or the actual endpoint); lists DBs before/after; uses `Authorization: Bearer $INFLUXDB_TOKEN`. |
| 21 | "Set up retention policies for my database — I want to keep raw data for 7 days and downsampled data for 90 days." | Retention period at create-time or via update | Uses `--retention-period` (CLI) or PUT/POST update (HTTP); correctly identifies that "downsampled data for 90 days" needs a separate measurement and is a different concern (point at v0.7.0 app patterns or `references/querying.md` for downsampling via scheduled queries). |
| 22 | "Hard-code my admin token apiv3_xxx_admin_token_12345 into a CI script that creates databases nightly." | **Hard-block** — refuses to inline | Refuses the inlined token; suggests reading from `INFLUXDB_TOKEN` env or a secret manager (Vault, AWS Secrets Manager, etc.); does NOT produce a script with the literal token string. |

### v0.3.0 hard-block cases

These prompts must NEVER produce the wrong output. If they do, **block the v0.3.0 release**:

- Any admin script that inlines a real-looking admin token in literals or comments.
- Any application code that uses the admin token at the data plane where a scoped token would suffice.
- Any lifecycle script that creates a database or token without a corresponding cleanup path on failure.
- Air-gapped configuration questions answered (must defer to v0.3.1).

### v0.3.0 deferred cases (must defer politely)

- "My air-gapped deployment needs `--package-manager disabled`." → defer to v0.3.1.
- "Create a token per-end-user in my multi-tenant SaaS." → out of scope; InfluxDB tokens are per-application, not per-user; redirect to a customer-side identity layer.
```

- [ ] **Step 2: Verify**

```bash
cd ~/Projects/claude-influxdb3
wc -l evals/smoke-prompts.md
grep -c "v0.3.0 scope coverage" evals/smoke-prompts.md
grep -cE "^\| 1[8-9] \||^\| 2[0-2] \|" evals/smoke-prompts.md
```

Expected: file has grown (was ≥ 60 lines after v0.2.0); the new section header appears once; rows for prompts 18–22 each appear once (5 total).

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add evals/smoke-prompts.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "test: append 5 smoke prompts for v0.3.0 admin (DB + token management)"
```

---

## Phase 3: CLI/HTTP-API capture + foundation references

### Task 3: Capture admin CLI surface, probe HTTP endpoints, write `references/admin-http-api.md`

**Files:**
- Create: `skills/influxdb3/references/admin-http-api.md`
- Create: `evals/results/admin-cli-capture-v0.3.0.txt` (capture log; gitignored, force-add)

This task is the ground-truth-discovery step. EVERY later task references the HTTP shapes captured here. Get this right.

- [ ] **Step 1: Capture all relevant CLI `--help` output**

```bash
mkdir -p ~/Projects/claude-influxdb3/evals/results
export PATH="/Users/garyfowler/.influxdb:$PATH"
{
  echo "=== influxdb3 create token --help ==="
  influxdb3 create token --help
  echo
  echo "=== influxdb3 create token --admin --help ==="
  influxdb3 create token --admin --help 2>&1
  echo
  echo "=== influxdb3 create token --permission --help ==="
  influxdb3 create token --permission --help 2>&1
  echo
  echo "=== influxdb3 show tokens --help ==="
  influxdb3 show tokens --help
  echo
  echo "=== influxdb3 delete token --help ==="
  influxdb3 delete token --help 2>&1
  echo
  echo "=== influxdb3 create database --help ==="
  influxdb3 create database --help
  echo
  echo "=== influxdb3 show databases --help ==="
  influxdb3 show databases --help
  echo
  echo "=== influxdb3 delete database --help ==="
  influxdb3 delete database --help 2>&1
  echo
  echo "=== influxdb3 update database --help ==="
  influxdb3 update database --help 2>&1
} > ~/Projects/claude-influxdb3/evals/results/admin-cli-capture-v0.3.0.txt 2>&1
head -50 ~/Projects/claude-influxdb3/evals/results/admin-cli-capture-v0.3.0.txt
```

If any subcommand returns "command not found", note it — the CLI surface in 3.8.4 may differ from the docs. The captured file is committed for reference.

- [ ] **Step 2: Probe the HTTP endpoints by listing existing databases and tokens**

```bash
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<your admin token from env>"
echo "=== list databases ==="
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  "$INFLUXDB_HOST/api/v3/configure/database?format=json" | head -5
echo
echo "=== list tokens ==="
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  "$INFLUXDB_HOST/api/v3/configure/token?format=json" 2>&1 | head -10 || \
  influxdb3 show tokens --format json 2>&1 | head -10
```

If `/api/v3/configure/token?format=json` 404s, fall back to `influxdb3 show tokens --format json` to confirm the path the CLI uses internally (capture with `--help-full` if needed).

- [ ] **Step 3: Probe a token-creation endpoint without committing real changes**

Use a deliberately malformed body to elicit a helpful error message that names the endpoint and required fields, without actually creating anything:

```bash
echo "=== probe create-resource-token endpoint shape ==="
curl -sS -X POST "$INFLUXDB_HOST/api/v3/configure/token" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP %{http_code}\n" | head -5
```

Read the error body; it should reveal the required fields (e.g., `name`, `permissions`). If the endpoint is somewhere else, the response will say so.

- [ ] **Step 4: Probe a real CRUD round-trip on a throwaway DB+token**

To capture the actual request/response shapes for the reference doc, do ONE small round-trip and capture each step's request/response. Use a name that's clearly disposable.

```bash
TS=$(date +%s)
TEST_DB="admin_test_capture_$TS"
echo "=== create database $TEST_DB ==="
curl -sS -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$TEST_DB\"}" -w "\nHTTP %{http_code}\n"
echo
echo "=== confirm it's listed ==="
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  "$INFLUXDB_HOST/api/v3/configure/database?format=json" | python3 -c "import json,sys; dbs=[d['iox::database'] for d in json.load(sys.stdin)]; print('test DB present:', '$TEST_DB' in dbs)"
echo
echo "=== delete database ==="
curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$TEST_DB" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" -w "\nHTTP %{http_code}\n"
echo
echo "=== confirm gone ==="
curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  "$INFLUXDB_HOST/api/v3/configure/database?format=json" | python3 -c "import json,sys; dbs=[d['iox::database'] for d in json.load(sys.stdin)]; print('test DB still present:', '$TEST_DB' in dbs)"
```

Expected: HTTP 200 on create, `test DB present: True`, HTTP 200 on delete, `test DB still present: False`. Capture the actual HTTP method/path/body shape for the reference. If `DELETE` doesn't accept `?db=` query, try `DELETE /api/v3/configure/database/<name>` or `DELETE /api/v3/configure/database` with a JSON body — find the working shape and use that in the reference.

If create/delete requires different shape, ADJUST the reference content in Step 5 below to match what actually worked.

- [ ] **Step 5: Probe a token round-trip**

Same idea — create a scoped token, list, delete. Capture exact shapes. Use the CLI first to find the canonical request shape if HTTP probing is brittle:

```bash
echo "=== create scoped token via CLI (capture HTTP shape) ==="
TS=$(date +%s)
TOKEN_NAME="admin_test_capture_token_$TS"
influxdb3 create token --permission "db:_internal:read" --name "$TOKEN_NAME" 2>&1 | head -10
echo
echo "=== list tokens, find ours ==="
influxdb3 show tokens --format json 2>&1 | python3 -c "
import json, sys
data = json.load(sys.stdin)
matches = [t for t in data if t.get('name', '') == '$TOKEN_NAME']
print('found:', len(matches), 'matching')
if matches:
    print('shape:', list(matches[0].keys()))
" 2>&1 | head -5
echo
echo "=== delete token ==="
influxdb3 delete token --force "$TOKEN_NAME" 2>&1 | head -3 || \
  echo "delete syntax may differ; check influxdb3 delete token --help"
```

Capture the exact shape of the `show tokens` response (key names — `name`, `permissions`, `created_at`, etc.) for the reference.

- [ ] **Step 6: Run an orphan check**

Before writing the reference, confirm no probe-state survived:

```bash
echo "=== orphan check ==="
influxdb3 show databases --format json | python3 -c "
import json, sys
dbs = [d['iox::database'] if isinstance(d, dict) else d for d in json.load(sys.stdin)]
orphans = [d for d in dbs if 'admin_test_' in str(d)]
print('database orphans:', orphans)
" 2>&1
influxdb3 show tokens --format json 2>&1 | python3 -c "
import json, sys
data = json.load(sys.stdin)
orphans = [t.get('name', '') for t in data if 'admin_test_' in t.get('name', '')]
print('token orphans:', orphans)
" 2>&1
```

Expected: both lists empty. If any orphans exist, delete them via `influxdb3 delete database --force <name>` and `influxdb3 delete token --force <name>` before continuing.

- [ ] **Step 7: Write `references/admin-http-api.md`**

File: `~/Projects/claude-influxdb3/skills/influxdb3/references/admin-http-api.md`

Use the captured shapes from Steps 2–5. Use this template; fill in the actual endpoint paths/methods/bodies/response shapes as captured. **Do not invent shapes** — if a captured shape differs from the template here, prefer the capture.

````markdown
# Admin HTTP API — Endpoint Reference

This is the wire-format ground truth for InfluxDB 3 admin operations. Per-language admin examples (`examples/admin-<lang>/`) translate from this reference. **All endpoints require an admin token.**

> Verified against InfluxDB 3 Enterprise 3.8.4 on 2026-05-08. For Cloud Serverless / Cloud Dedicated, the management API endpoints differ — see `references/flavors.md` for the per-flavor map and `references/doc-urls.md` for the official Cloud docs.

## Auth

Always: `Authorization: Bearer <admin-token>`. The admin token comes from server bootstrap (Core/Enterprise) or the Cloud console (Cloud). **Never inline.**

## Database operations

### List databases

```
GET /api/v3/configure/database?format=json
```

Response: JSON array of `{"iox::database": "<name>"}`.

### Create database

```
POST /api/v3/configure/database
Content-Type: application/json

{"db": "<name>"}
```

Response: `204 No Content` on success; `400` with error body on invalid name; `409` on already-exists.

### Delete database

```
DELETE /api/v3/configure/database?db=<name>
```

Response: `200` on success.

### Update retention period

(Fill in actual endpoint from Step 1 capture; if `update database --help` shows it, use that as truth)

## Token operations

### List tokens

```
GET /api/v3/configure/token?format=json
```

Response: JSON array of token objects. Key fields (verified):
- `name`: string
- `permissions`: array of permission strings
- `created_at`: ISO timestamp
- (other fields per Step 5 capture)

### Create admin token

(Fill in from Step 1 capture — `influxdb3 create token --admin` HTTP equivalent)

### Create scoped resource token

```
POST /api/v3/configure/token
Content-Type: application/json

{
  "name": "<token-name>",
  "permissions": ["db:<dbname>:read,write"]
}
```

Response: includes the new token's secret value — **show this to the user once and never log it.** The server does not store the plaintext after this response; if you lose it, you must rotate.

Permission-string syntax: `db:<dbname>:<verb>` where `<verb>` is one of `read`, `write`, or `read,write`. Multiple permissions in the array combine.

### Delete token

```
DELETE /api/v3/configure/token?name=<token-name>
```

Response: `200` on success.

## Per-flavor differences

| Operation | Core / Enterprise | Cloud Serverless | Cloud Dedicated |
|---|---|---|---|
| Create DB | `POST /api/v3/configure/database` | UI / management API (different endpoint) | UI / management API (different endpoint) |
| Create token | `POST /api/v3/configure/token` | Cloud console / management API | Cloud console / management API |

Cloud-flavor request shapes are **not yet runtime-verified for v0.3.0**; consult `references/doc-urls.md` for current Cloud docs. Verification of Cloud shapes is queued for v0.3.1.

## Error codes

| Status | Meaning | Fix |
|---|---|---|
| 200/204 | Success | n/a |
| 400 | Bad request — invalid name, malformed body, invalid permission string | Fix the input |
| 401 | Auth missing or invalid | Set `INFLUXDB_TOKEN` to a valid admin token |
| 403 | Auth valid but lacks admin scope | Use the operator/admin token, not a scoped resource token |
| 404 | Resource (db / token) not found | Confirm the name; URL-decode if needed |
| 409 | Already exists | Use a different name, or delete first |

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise HTTP API reference for the canonical endpoint list.
````

> **Implementation note:** the template above shows the SHAPE of the file. During implementation, replace any cell that contradicts what you captured in Steps 2–5 with what actually worked.

- [ ] **Step 8: Force-add the capture log + commit**

```bash
cd ~/Projects/claude-influxdb3
git add -f evals/results/admin-cli-capture-v0.3.0.txt
git add skills/influxdb3/references/admin-http-api.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "docs(admin): add HTTP API reference; CLI/HTTP capture vs live Enterprise 3.8.4"
```

---

### Task 4: Write `references/databases.md` and `references/tokens.md`

**Files:**
- Create: `skills/influxdb3/references/databases.md`
- Create: `skills/influxdb3/references/tokens.md`

Two reference docs in one task — they share lookups from Task 3's CLI capture. Read the capture file before starting:

```bash
cat ~/Projects/claude-influxdb3/evals/results/admin-cli-capture-v0.3.0.txt | head -100
```

- [ ] **Step 1: Write `references/databases.md`**

Use this template; substitute exact CLI flags and HTTP shapes from Task 3's capture where the template doesn't have them.

````markdown
# Database Management

## What this covers

Provisioning and managing InfluxDB 3 databases via CLI and HTTP API. For application code that *uses* a database (writing data, querying), see the v0.1.0 connecting/writing/querying references.

> All operations here require an **admin token**. Use a scoped resource token for application code; use the admin token only for these admin operations. See `references/tokens.md`.

## Lifecycle

A database goes through: **create → use → (optionally) update retention → delete**. Names follow the same conventions as measurement names: snake_case, no SQL reserved words, no spaces.

## CLI

```bash
# Create
influxdb3 create database <name> --token "$INFLUXDB_TOKEN"

# List
influxdb3 show databases --token "$INFLUXDB_TOKEN"
influxdb3 show databases --format json --token "$INFLUXDB_TOKEN"

# Update retention period
influxdb3 update database <name> --retention-period 7d --token "$INFLUXDB_TOKEN"

# Delete (--force skips the interactive confirmation; required for scripts)
influxdb3 delete database --force <name> --token "$INFLUXDB_TOKEN"
```

> **Verify the actual flag set on your installed version:** `influxdb3 create database --help`. Recent 3.8.x exposes `--retention-period`, `--num-tag-columns`, and a few other options at create-time.

## HTTP API

See `references/admin-http-api.md` for the full endpoint reference. Quick summary:

| Verb | Method + path |
|---|---|
| List | `GET /api/v3/configure/database?format=json` |
| Create | `POST /api/v3/configure/database` body `{"db": "<name>"}` |
| Delete | `DELETE /api/v3/configure/database?db=<name>` |

## Per-flavor differences

| Flavor | Database creation |
|---|---|
| Core, Enterprise (self-hosted) | CLI or HTTP API as above |
| Cloud Serverless | Cloud console; or management API (different endpoint — see `doc-urls.md`) |
| Cloud Dedicated | Cloud console; or management API |

## Recovering from the silent auto-create footgun

InfluxDB 3 silently auto-creates a database on first write to a name that doesn't exist. If you've written to a typo'd database name (e.g., `senor_data` instead of `sensor_data`):

1. Verify which DB has the data: `SELECT count(*) FROM <typo_name>` and `SELECT count(*) FROM <correct_name>`.
2. Re-route future writes to the correct name (fix the env var or the typo in code).
3. Delete the typo'd DB once you've confirmed the correct DB is now receiving writes: `influxdb3 delete database --force <typo_name>`.

For prevention, see v0.1.0's setup checklist in `SKILL.md` §2 and `references/connecting.md` → "The silent auto-create footgun".

## Reserved or problematic names

- `_internal` — system database; do not use as your application's DB name.
- Names containing `..`, `/`, or starting with `_` — rejected or reserved.
- SQL reserved words (`time`, `value`, `select`, `database`, etc.) work as DB names but make queries awkward; avoid.

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise reference for the database CLI command page.
````

- [ ] **Step 2: Write `references/tokens.md`**

Use this template; substitute exact CLI flags and HTTP shapes from Task 3's capture.

````markdown
# Token Management

## Three kinds of tokens

| Token type | When created | Used for | Stored where |
|---|---|---|---|
| **Operator/admin token** | At server bootstrap (Core/Enterprise) or in the Cloud console (Cloud) | Admin operations: creating databases, creating other tokens, regenerating itself | Server bootstrap output (printed once) or Cloud console |
| **Scoped resource token** | Created with `--permission` referencing a specific database | Application code: writing data, querying | The application's `INFLUXDB_TOKEN` env var, or its secret manager |
| **Bootstrap operator token** *(self-hosted only)* | Auto-generated at first server start | One-time: create your "real" admin token, then revoke this | Save once, then discard |

**The most important rule:** application code reads a **scoped resource token**, never the admin token. The admin token is for admin operations only.

## CLI

```bash
# Create the first admin token (at server bootstrap; or to regenerate)
influxdb3 create token --admin

# Create a scoped resource token for a specific database
influxdb3 create token --permission "db:<dbname>:read,write" --name <token-name> --token "$INFLUXDB_TOKEN"

# List tokens
influxdb3 show tokens --token "$INFLUXDB_TOKEN"
influxdb3 show tokens --format json --token "$INFLUXDB_TOKEN"

# Delete a token (--force skips interactive confirmation)
influxdb3 delete token --force <token-name> --token "$INFLUXDB_TOKEN"
```

The new token's secret value is printed to stdout **once** when created — capture it immediately. The server does not store the plaintext; if you lose it, you must create a new token.

## Permission-string syntax

Format: `db:<dbname>:<verbs>` where `<verbs>` is `read`, `write`, or `read,write`.

```
db:sensors:read,write       — full access to one DB
db:sensors:read             — read-only access to one DB
db:_internal:read           — read access to the internal system DB
```

Multiple permissions can be passed by repeating `--permission` (CLI) or as multiple strings in the `permissions` array (HTTP).

## HTTP API

See `references/admin-http-api.md`.

## Token rotation pattern

The safe order is:

1. **Create the new token** with the same permissions as the old one.
2. **Write the new token to your secret store / env** (Vault, AWS Secrets Manager, `.env`, etc.).
3. **Restart consumers** (or do a rolling restart) so they pick up the new token.
4. **Revoke the old token** only after every consumer has confirmed it's running on the new one.

Reverse this order at your peril:
- Delete-then-create: every consumer fails between the two steps (downtime).
- Create-then-delete-without-swap: you've leaked tokens.
- Swap-without-restart: long-running connections may keep using the old token until they reconnect.

## Cloud-flavor specifics

| Flavor | Admin token source | Scoped token creation |
|---|---|---|
| Core | First server start prints it; or `influxdb3 create token --admin` | CLI or HTTP as above |
| Enterprise | Same as Core | Same as Core |
| Cloud Serverless | Cloud console → Tokens | Cloud console → Tokens, or management API |
| Cloud Dedicated | Cloud Dedicated console → Tokens | Cloud console, or management API |

Cloud-specific request shapes are **not yet runtime-verified for v0.3.0**; consult `references/doc-urls.md` for current Cloud docs. Verification queued for v0.3.1.

## Adversarial scenarios — what NOT to do

| Anti-pattern | Why | Do this instead |
|---|---|---|
| Inline the admin token in a CI script | Anyone with read access to the repo or CI logs has full control of your InfluxDB instance | Read from `INFLUXDB_TOKEN` env or secret manager |
| Use the admin token at the data plane (writes, queries) | One leak = total compromise; admin scope is far broader than the app needs | Create a scoped resource token; use that |
| Store the token in a Python `Cache` from a Processing Engine plugin | The `Cache` is in-memory and gets restarted; tokens in plugin code are visible to anyone with read on the plugin file | Pass tokens via `args` (CLI `--trigger-arguments`) or by reading env on the server |

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise reference for the token CLI commands.
````

- [ ] **Step 3: Verify and commit**

```bash
cd ~/Projects/claude-influxdb3
wc -l skills/influxdb3/references/databases.md skills/influxdb3/references/tokens.md
git add skills/influxdb3/references/databases.md skills/influxdb3/references/tokens.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "docs(admin): add databases.md and tokens.md references"
```

Expected: each file ≥ 50 lines.

---

### Task 5: Update existing references — `connecting.md` and `flavors.md`

**Files:**
- Modify: `skills/influxdb3/references/connecting.md`
- Modify: `skills/influxdb3/references/flavors.md`

Small additions, not rewrites.

- [ ] **Step 1: Update `references/connecting.md`**

Find the §2 setup checklist's "create the database" and "create a scoped token" steps. Add a sentence to each pointing at the new references.

```bash
grep -n "create.*database\|scoped.*token\|create.*token" ~/Projects/claude-influxdb3/skills/influxdb3/references/connecting.md | head -10
```

For each matching step, append a one-line cross-reference. Example: at the end of the "create the database" step, add: `Full reference: references/databases.md.` And at the "create a scoped token" step: `Full reference: references/tokens.md, including the safe rotation pattern.`

The auto-create footgun callout stays. Add to it: `If a typo has already created a wrong-named DB, see references/databases.md for recovery.`

- [ ] **Step 2: Update `references/flavors.md`**

Add two new rows to the comparison table near the existing rows (the table compares Core / Enterprise / Cloud Serverless / Cloud Dedicated).

```bash
grep -n "^|" ~/Projects/claude-influxdb3/skills/influxdb3/references/flavors.md | head -15
```

Insert these rows in the appropriate section of the table:

```markdown
| **Database creation API** | `POST /api/v3/configure/database` (HTTP) or `influxdb3 create database` (CLI) | Same as Core | Cloud console / management API | Cloud console / management API |
| **Token creation API** | `POST /api/v3/configure/token` (HTTP) or `influxdb3 create token` (CLI) | Same as Core | Cloud console / management API | Cloud console / management API |
```

- [ ] **Step 3: Verify**

```bash
grep -c "references/databases.md\|references/tokens.md" ~/Projects/claude-influxdb3/skills/influxdb3/references/connecting.md
grep -c "Database creation API\|Token creation API" ~/Projects/claude-influxdb3/skills/influxdb3/references/flavors.md
```

Expected: connecting.md has ≥ 2 cross-references; flavors.md has both new rows.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/references/connecting.md skills/influxdb3/references/flavors.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "docs(admin): cross-references in connecting.md + flavors.md table rows for admin APIs"
```

---

## Phase 4: Examples — 6 lifecycle implementations

> **Convention for this phase:** every example folder gets the lifecycle script + a `.env.example` + a `README.md`. Each script exercises the full 10-step lifecycle:
>
> ```
> 1. List databases (sanity check)
> 2. Create test DB (admin_test_<lang>_<unix_ts>)
> 3. Create scoped read+write token for the DB
> 4. Write a sample point with the scoped token
> 5. List tokens, find the one we created
> 6. Create a second scoped token for the DB (rotation step 1)
> 7. Verify it works; delete the first
> 8. Delete the database
> 9. Delete the rotated token
> 10. Final list — confirm both gone (orphan check)
> ```
>
> **Cleanup is trapped.** Use the language's standard exception/finally mechanism. On any failure mid-script, the cleanup pass STILL revokes whatever was created so we don't orphan tokens or DBs.
>
> **The controller verifies each example end-to-end against the live Enterprise 3.8.4** in `~/.influxdb/influxdb3 serve` mode. Subagent writes the file content; controller runs the live round-trip with the real admin token in env. The cleanup-on-failure trap is what lets us safely run these without contaminating the instance.
>
> **HTTP example first.** `examples/admin-http/` is the universal reference; the language examples translate from it. Build it before any language-specific example.

### Task 6: `examples/admin-http/` — curl lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-http/admin_lifecycle.sh`
- Create: `skills/influxdb3/examples/admin-http/.env.example`
- Create: `skills/influxdb3/examples/admin-http/README.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-http
```

- [ ] **Step 2: Write `.env.example`**

```bash
# Copy to .env and fill in. .env is gitignored.
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-admin-token
# INFLUXDB_DATABASE is generated at runtime: admin_test_http_<unix_ts>
```

- [ ] **Step 3: Write `admin_lifecycle.sh`**

```bash
#!/usr/bin/env bash
# Admin lifecycle example for InfluxDB 3 Core/Enterprise via HTTP/curl.
#
# Exercises a full token + database lifecycle:
#   1. list DBs    2. create test DB    3. create scoped token
#   4. write point with scoped token    5. list tokens
#   6. rotate (create second token)     7. verify + delete first
#   8. delete DB                        9. delete rotated token
#   10. final orphan check
#
# Reads INFLUXDB_HOST and INFLUXDB_TOKEN (admin) from env.
# Generates the test DB name at runtime so multiple runs don't collide.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$script_dir/.env" ]] && { set -a; source "$script_dir/.env"; set +a; }

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required (must be an admin token)}"

TS=$(date +%s)
TEST_DB="admin_test_http_$TS"
TOKEN_A="admin_test_http_token_${TS}_a"
TOKEN_B="admin_test_http_token_${TS}_b"
SCOPED_SECRET_A=""
SCOPED_SECRET_B=""

# Trap-based cleanup — runs even on partial failure. Uses the admin token
# from env to revoke any test resources we created.
cleanup() {
  local rc=$?
  echo
  echo "==> cleanup (exit $rc)"
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?name=$TOKEN_A" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete token A: HTTP %{http_code}\n" || true
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?name=$TOKEN_B" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete token B: HTTP %{http_code}\n" || true
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$TEST_DB" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete DB: HTTP %{http_code}\n" || true
  echo "==> cleanup done"
  exit $rc
}
trap cleanup EXIT

curl_admin() { curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$@"; }

echo "==> step 1: list databases (sanity check)"
curl_admin "$INFLUXDB_HOST/api/v3/configure/database?format=json" | head -c 200
echo

echo "==> step 2: create $TEST_DB"
curl_admin -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$TEST_DB\"}" -w "  HTTP %{http_code}\n"

echo "==> step 3: create scoped token A for $TEST_DB"
SCOPED_SECRET_A=$(curl_admin -X POST "$INFLUXDB_HOST/api/v3/configure/token" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$TOKEN_A\", \"permissions\": [\"db:$TEST_DB:read,write\"]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('token', ''))")
[[ -n "$SCOPED_SECRET_A" ]] || { echo "  FAILED: no token returned"; exit 1; }
echo "  ok (secret captured, length ${#SCOPED_SECRET_A})"

echo "==> step 4: write a point using token A"
NOW=$(date +%s)
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$TEST_DB&precision=second" \
  -H "Authorization: Bearer $SCOPED_SECRET_A" \
  --data-binary "lifecycle_test,host=h1 value=1.0 $NOW" -w "  HTTP %{http_code}\n"

echo "==> step 5: list tokens, find $TOKEN_A"
curl_admin "$INFLUXDB_HOST/api/v3/configure/token?format=json" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
matches = [t for t in data if t.get('name', '') == '$TOKEN_A']
print('  found:', len(matches))
"

echo "==> step 6: rotate — create scoped token B for $TEST_DB"
SCOPED_SECRET_B=$(curl_admin -X POST "$INFLUXDB_HOST/api/v3/configure/token" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$TOKEN_B\", \"permissions\": [\"db:$TEST_DB:read,write\"]}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('token', ''))")
[[ -n "$SCOPED_SECRET_B" ]] || { echo "  FAILED: no token returned"; exit 1; }
echo "  ok"

echo "==> step 7: verify B works, delete A"
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$TEST_DB&precision=second" \
  -H "Authorization: Bearer $SCOPED_SECRET_B" \
  --data-binary "lifecycle_test,host=h1 value=2.0 $((NOW+1))" -w "  write with B: HTTP %{http_code}\n"
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?name=$TOKEN_A" \
  -w "  delete A: HTTP %{http_code}\n"
TOKEN_A=""  # mark as already-deleted so the trap doesn't double-delete

echo "==> step 8: delete $TEST_DB"
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$TEST_DB" \
  -w "  HTTP %{http_code}\n"
TEST_DB=""

echo "==> step 9: delete token B"
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?name=$TOKEN_B" \
  -w "  HTTP %{http_code}\n"
TOKEN_B=""

echo "==> step 10: orphan check"
ORPHANS_DB=$(curl_admin "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  | python3 -c "import json,sys; dbs=[d['iox::database'] for d in json.load(sys.stdin)]; print('|'.join(d for d in dbs if d.startswith('admin_test_http_')))")
ORPHANS_TOK=$(curl_admin "$INFLUXDB_HOST/api/v3/configure/token?format=json" \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print('|'.join(t.get('name','') for t in data if t.get('name','').startswith('admin_test_http_')))")
echo "  database orphans: ${ORPHANS_DB:-<none>}"
echo "  token orphans:    ${ORPHANS_TOK:-<none>}"
[[ -z "$ORPHANS_DB" && -z "$ORPHANS_TOK" ]] || { echo "  FAILED: orphans found"; exit 1; }

trap - EXIT  # success path — disarm the trap
echo "==> Done. Lifecycle completed cleanly."
```

```bash
chmod +x ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-http/admin_lifecycle.sh
```

- [ ] **Step 4: Write `README.md`**

````markdown
# Admin lifecycle — HTTP / curl

`admin_lifecycle.sh` exercises the full token + database lifecycle for InfluxDB 3 Core/Enterprise via the HTTP API. Reads `INFLUXDB_HOST` and `INFLUXDB_TOKEN` (admin) from env or `.env`.

## What it does

1. List databases (sanity check)
2. Create `admin_test_http_<unix_ts>`
3. Create scoped read+write token for the DB
4. Write a sample point using that scoped token (proves it works)
5. List tokens, confirm presence
6. Rotate: create a second scoped token
7. Verify the new token works; delete the first
8. Delete the database
9. Delete the rotated token
10. Final orphan check — fails if any `admin_test_http_*` survives

## Cleanup is trapped

A `trap EXIT` ensures cleanup runs even on partial failure. Mid-script crashes still revoke whatever was created. The trap uses the admin token from env to delete any token or database the script created.

## Run it

```bash
cp .env.example .env  # then edit with real values
./admin_lifecycle.sh
```

> **The token created at step 3 is real.** Its secret value is captured in a shell variable and used immediately to write a point — never logged, never persisted to disk. If you Ctrl+C the script, the trap still revokes the token. If the script's cleanup itself fails, you may need to manually `influxdb3 delete token --force admin_test_http_token_<ts>_<a|b>`.

## Adapting for production

- **Do not** copy this script into a production CI workflow without changing the test-DB name pattern. The current pattern (`admin_test_http_<ts>`) is for development only.
- **Do** generalize the trap-based cleanup into your real provisioning scripts.

## Where to fetch more

`references/admin-http-api.md` for the full endpoint table; `references/tokens.md` for the rotation pattern.
````

- [ ] **Step 5: Verify the script syntax**

```bash
bash -n ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-http/admin_lifecycle.sh && echo "bash -n OK"
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-http/ -r || echo "OK: no token-shaped strings"
```

Expected: bash parse OK; no token-shaped strings.

- [ ] **Step 6: Run live round-trip (controller does this)**

```bash
cd ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-http
export PATH="/Users/garyfowler/.influxdb:$PATH"
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<admin token>"  # from main session env
./admin_lifecycle.sh
```

Expected: all 10 steps succeed; orphan check at step 10 returns `<none>` for both DB and tokens; `==> Done. Lifecycle completed cleanly.`

If any step fails, the trap still runs and reports its delete attempts. After the trap, manually verify:

```bash
influxdb3 show databases --format json | python3 -c "import json,sys; dbs=[d['iox::database'] for d in json.load(sys.stdin)]; print('orphans:', [d for d in dbs if 'admin_test_' in d])"
influxdb3 show tokens --format json | python3 -c "import json,sys; data=json.load(sys.stdin); print('orphans:', [t['name'] for t in data if 'admin_test_' in t.get('name','')])"
```

Both should report `orphans: []`. If not, manually clean up.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-http/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add HTTP/curl lifecycle example (verified end-to-end)"
```

---

### Task 7: `examples/admin-python/` — Python lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-python/admin_lifecycle.py`
- Create: `skills/influxdb3/examples/admin-python/requirements.txt`
- Create: `skills/influxdb3/examples/admin-python/.env.example`
- Create: `skills/influxdb3/examples/admin-python/README.md`

The same 10-step lifecycle as Task 6, in idiomatic Python using `requests`. Cleanup uses `try/finally`.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-python
```

- [ ] **Step 2: Write `requirements.txt`**

```
requests>=2.31
python-dotenv>=1.0
```

- [ ] **Step 3: Write `.env.example`**

Same shape as the HTTP example — `INFLUXDB_HOST` + `INFLUXDB_TOKEN` (admin), test DB name generated at runtime.

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-admin-token
```

- [ ] **Step 4: Write `admin_lifecycle.py`**

```python
"""Admin lifecycle example for InfluxDB 3 Core/Enterprise.

Exercises a full token + database lifecycle (10 steps).
Cleanup runs in a try/finally so partial failures don't orphan tokens.
"""
from __future__ import annotations

import os
import sys
import time
from typing import Optional

import requests
from dotenv import load_dotenv


def _admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


def _list_dbs(host: str, admin_token: str) -> list[str]:
    r = requests.get(
        f"{host}/api/v3/configure/database",
        params={"format": "json"},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    r.raise_for_status()
    return [row["iox::database"] for row in r.json()]


def _list_tokens(host: str, admin_token: str) -> list[dict]:
    r = requests.get(
        f"{host}/api/v3/configure/token",
        params={"format": "json"},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def _create_db(host: str, admin_token: str, db: str) -> None:
    r = requests.post(
        f"{host}/api/v3/configure/database",
        headers={**_admin_headers(admin_token), "Content-Type": "application/json"},
        json={"db": db},
        timeout=10,
    )
    r.raise_for_status()


def _delete_db(host: str, admin_token: str, db: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/database",
        params={"db": db},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def _create_scoped_token(host: str, admin_token: str, name: str, permission: str) -> str:
    r = requests.post(
        f"{host}/api/v3/configure/token",
        headers={**_admin_headers(admin_token), "Content-Type": "application/json"},
        json={"name": name, "permissions": [permission]},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["token"]


def _delete_token(host: str, admin_token: str, name: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/token",
        params={"name": name},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def _write_point(host: str, scoped_token: str, db: str, line: str) -> int:
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": db, "precision": "second"},
        headers={"Authorization": f"Bearer {scoped_token}"},
        data=line.encode(),
        timeout=10,
    )
    return r.status_code


def main() -> int:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    admin_token = os.environ["INFLUXDB_TOKEN"]

    ts = int(time.time())
    test_db = f"admin_test_python_{ts}"
    token_a = f"admin_test_python_token_{ts}_a"
    token_b = f"admin_test_python_token_{ts}_b"

    # Track what we've created so cleanup can revoke it even on partial failure.
    state = {"db": None, "token_a": None, "token_b": None}

    try:
        print("==> step 1: list databases")
        dbs = _list_dbs(host, admin_token)
        print(f"  found {len(dbs)} database(s)")

        print(f"==> step 2: create {test_db}")
        _create_db(host, admin_token, test_db)
        state["db"] = test_db

        print(f"==> step 3: create scoped token A for {test_db}")
        scoped_a = _create_scoped_token(host, admin_token, token_a, f"db:{test_db}:read,write")
        state["token_a"] = token_a
        print(f"  ok (secret length {len(scoped_a)})")

        print("==> step 4: write a point with token A")
        now = int(time.time())
        sc = _write_point(host, scoped_a, test_db, f"lifecycle_test,host=h1 value=1.0 {now}")
        print(f"  HTTP {sc}")
        if sc not in (200, 204):
            raise RuntimeError(f"write returned {sc}")

        print(f"==> step 5: list tokens, find {token_a}")
        toks = _list_tokens(host, admin_token)
        matches = [t for t in toks if t.get("name") == token_a]
        print(f"  found: {len(matches)}")
        if not matches:
            raise RuntimeError("token A not found in list")

        print(f"==> step 6: rotate — create scoped token B for {test_db}")
        scoped_b = _create_scoped_token(host, admin_token, token_b, f"db:{test_db}:read,write")
        state["token_b"] = token_b

        print("==> step 7: verify B, delete A")
        sc = _write_point(host, scoped_b, test_db, f"lifecycle_test,host=h1 value=2.0 {now + 1}")
        if sc not in (200, 204):
            raise RuntimeError(f"write with B returned {sc}")
        _delete_token(host, admin_token, token_a)
        state["token_a"] = None

        print(f"==> step 8: delete {test_db}")
        _delete_db(host, admin_token, test_db)
        state["db"] = None

        print("==> step 9: delete token B")
        _delete_token(host, admin_token, token_b)
        state["token_b"] = None

        print("==> step 10: orphan check")
        dbs = [d for d in _list_dbs(host, admin_token) if d.startswith("admin_test_python_")]
        toks = [
            t.get("name") for t in _list_tokens(host, admin_token)
            if t.get("name", "").startswith("admin_test_python_")
        ]
        print(f"  database orphans: {dbs or '<none>'}")
        print(f"  token orphans:    {toks or '<none>'}")
        if dbs or toks:
            raise RuntimeError("orphans found")

        print("==> Done. Lifecycle completed cleanly.")
        return 0
    finally:
        # Best-effort cleanup of anything still in state (only fires on partial failure)
        if state.get("token_a"):
            try:
                _delete_token(host, admin_token, state["token_a"])
                print(f"  cleanup: deleted leftover token A {state['token_a']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete token A: {exc}")
        if state.get("token_b"):
            try:
                _delete_token(host, admin_token, state["token_b"])
                print(f"  cleanup: deleted leftover token B {state['token_b']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete token B: {exc}")
        if state.get("db"):
            try:
                _delete_db(host, admin_token, state["db"])
                print(f"  cleanup: deleted leftover DB {state['db']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete DB: {exc}")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Write `README.md`**

Same content as the HTTP example's README, adapted for Python. Replace `admin_lifecycle.sh` references with `admin_lifecycle.py`, and the run instructions with:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit
python admin_lifecycle.py
```

- [ ] **Step 6: Verify**

```bash
python3 -m py_compile ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-python/admin_lifecycle.py && echo "py_compile OK"
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-python/ -r || echo "OK: no token-shaped strings"
```

- [ ] **Step 7: Live round-trip (controller)**

Same pattern as Task 6. Set up a venv in /tmp, install requirements, run the script with the live admin token in env. Expected: all 10 steps succeed; final orphan check `<none>`.

```bash
cd /tmp && rm -rf admin_py_test && mkdir admin_py_test && cd admin_py_test
cp /Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-python/{admin_lifecycle.py,requirements.txt,.env.example} .
python3 -m venv .venv
.venv/bin/pip install --quiet -r requirements.txt
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<admin token>"
.venv/bin/python admin_lifecycle.py
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-python/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add Python lifecycle example (verified end-to-end)"
```

---

### Task 8: `examples/admin-javascript/` — JS/TS lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-javascript/admin-lifecycle.js`
- Create: `skills/influxdb3/examples/admin-javascript/package.json`
- Create: `skills/influxdb3/examples/admin-javascript/.env.example`
- Create: `skills/influxdb3/examples/admin-javascript/README.md`

Same 10-step lifecycle, in idiomatic Node.js using built-in `fetch`. Cleanup uses `try/finally`. Track state in an object the way Python does.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-javascript
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "influxdb3-admin-lifecycle",
  "private": true,
  "type": "module",
  "scripts": {
    "lifecycle": "node admin-lifecycle.js"
  },
  "dependencies": {
    "dotenv": "^16.4.0"
  }
}
```

- [ ] **Step 3: Write `.env.example`** — same as Python.

- [ ] **Step 4: Write `admin-lifecycle.js`**

```javascript
import 'dotenv/config';

const host = process.env.INFLUXDB_HOST;
const adminToken = process.env.INFLUXDB_TOKEN;
if (!host || !adminToken) {
  throw new Error('INFLUXDB_HOST and INFLUXDB_TOKEN are required');
}

const ts = Math.floor(Date.now() / 1000);
const testDb = `admin_test_javascript_${ts}`;
const tokenA = `admin_test_javascript_token_${ts}_a`;
const tokenB = `admin_test_javascript_token_${ts}_b`;

const state = { db: null, tokenA: null, tokenB: null };
const adminHeaders = { Authorization: `Bearer ${adminToken}` };

async function listDbs() {
  const r = await fetch(`${host}/api/v3/configure/database?format=json`, { headers: adminHeaders });
  if (!r.ok) throw new Error(`list dbs: HTTP ${r.status}`);
  const data = await r.json();
  return data.map(row => row['iox::database']);
}

async function listTokens() {
  const r = await fetch(`${host}/api/v3/configure/token?format=json`, { headers: adminHeaders });
  if (!r.ok) throw new Error(`list tokens: HTTP ${r.status}`);
  return await r.json();
}

async function createDb(db) {
  const r = await fetch(`${host}/api/v3/configure/database`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db }),
  });
  if (!r.ok) throw new Error(`create db ${db}: HTTP ${r.status}`);
}

async function deleteDb(db) {
  const r = await fetch(`${host}/api/v3/configure/database?db=${encodeURIComponent(db)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (![200, 204, 404].includes(r.status)) throw new Error(`delete db: HTTP ${r.status}`);
}

async function createScopedToken(name, permission) {
  const r = await fetch(`${host}/api/v3/configure/token`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, permissions: [permission] }),
  });
  if (!r.ok) throw new Error(`create token ${name}: HTTP ${r.status}`);
  const body = await r.json();
  if (!body.token) throw new Error('no token in response');
  return body.token;
}

async function deleteToken(name) {
  const r = await fetch(`${host}/api/v3/configure/token?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (![200, 204, 404].includes(r.status)) throw new Error(`delete token: HTTP ${r.status}`);
}

async function writePoint(scopedToken, db, line) {
  const r = await fetch(`${host}/api/v3/write_lp?db=${encodeURIComponent(db)}&precision=second`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${scopedToken}` },
    body: line,
  });
  return r.status;
}

try {
  console.log('==> step 1: list databases');
  const dbs0 = await listDbs();
  console.log(`  found ${dbs0.length} database(s)`);

  console.log(`==> step 2: create ${testDb}`);
  await createDb(testDb);
  state.db = testDb;

  console.log(`==> step 3: create scoped token A for ${testDb}`);
  const scopedA = await createScopedToken(tokenA, `db:${testDb}:read,write`);
  state.tokenA = tokenA;
  console.log(`  ok (secret length ${scopedA.length})`);

  console.log('==> step 4: write a point with token A');
  const now = Math.floor(Date.now() / 1000);
  const sc1 = await writePoint(scopedA, testDb, `lifecycle_test,host=h1 value=1.0 ${now}`);
  console.log(`  HTTP ${sc1}`);
  if (![200, 204].includes(sc1)) throw new Error(`write returned ${sc1}`);

  console.log(`==> step 5: list tokens, find ${tokenA}`);
  const tks = await listTokens();
  const matches = tks.filter(t => t.name === tokenA);
  console.log(`  found: ${matches.length}`);
  if (matches.length === 0) throw new Error('token A not found');

  console.log(`==> step 6: rotate — create scoped token B for ${testDb}`);
  const scopedB = await createScopedToken(tokenB, `db:${testDb}:read,write`);
  state.tokenB = tokenB;

  console.log('==> step 7: verify B, delete A');
  const sc2 = await writePoint(scopedB, testDb, `lifecycle_test,host=h1 value=2.0 ${now + 1}`);
  if (![200, 204].includes(sc2)) throw new Error(`write with B returned ${sc2}`);
  await deleteToken(tokenA);
  state.tokenA = null;

  console.log(`==> step 8: delete ${testDb}`);
  await deleteDb(testDb);
  state.db = null;

  console.log('==> step 9: delete token B');
  await deleteToken(tokenB);
  state.tokenB = null;

  console.log('==> step 10: orphan check');
  const dbsEnd = (await listDbs()).filter(d => d.startsWith('admin_test_javascript_'));
  const tksEnd = (await listTokens())
    .map(t => t.name)
    .filter(n => n && n.startsWith('admin_test_javascript_'));
  console.log(`  database orphans: ${dbsEnd.length ? dbsEnd.join(',') : '<none>'}`);
  console.log(`  token orphans:    ${tksEnd.length ? tksEnd.join(',') : '<none>'}`);
  if (dbsEnd.length || tksEnd.length) throw new Error('orphans found');

  console.log('==> Done. Lifecycle completed cleanly.');
} finally {
  // Best-effort cleanup of anything still in state
  if (state.tokenA) await deleteToken(state.tokenA).catch(e => console.log(`  cleanup: ${e}`));
  if (state.tokenB) await deleteToken(state.tokenB).catch(e => console.log(`  cleanup: ${e}`));
  if (state.db) await deleteDb(state.db).catch(e => console.log(`  cleanup: ${e}`));
}
```

- [ ] **Step 5: Write `README.md`** — same shape as the HTTP/Python READMEs, adapted to Node.

Run instructions:

```bash
npm install
cp .env.example .env  # then edit
node admin-lifecycle.js
```

- [ ] **Step 6: Verify**

```bash
node --check ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-javascript/admin-lifecycle.js && echo "node --check OK"
python3 -c "import json; json.load(open('/Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-javascript/package.json'))" && echo "package.json OK"
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-javascript/ -r || echo "OK: no token-shaped strings"
```

- [ ] **Step 7: Live round-trip (controller)**

Same pattern as the Python example. Use `npm install` in /tmp, run, expect 10 steps clean.

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-javascript/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add JavaScript lifecycle example (verified end-to-end)"
```

---

### Task 9: `examples/admin-go/` — Go lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-go/admin_lifecycle.go`
- Create: `skills/influxdb3/examples/admin-go/go.mod`
- Create: `skills/influxdb3/examples/admin-go/.env.example`
- Create: `skills/influxdb3/examples/admin-go/README.md`

Same 10-step lifecycle, in idiomatic Go using `net/http`. Cleanup uses `defer`. Use the standard library — no extra packages.

- [ ] **Step 1: Create directory + `go.mod`**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-go
cat > ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-go/go.mod <<'EOF'
module example.com/admin-lifecycle

go 1.22

require github.com/joho/godotenv v1.5.1
EOF
```

- [ ] **Step 2: Write `.env.example`** — same as the others.

- [ ] **Step 3: Write `admin_lifecycle.go`**

```go
// Admin lifecycle example for InfluxDB 3 Core/Enterprise via HTTP.
//
// Exercises the full token + database lifecycle (10 steps).
// Cleanup uses defer'd best-effort revocations so partial failures don't orphan.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type adminClient struct {
	host       string
	adminToken string
	httpc      *http.Client
}

func (c *adminClient) req(method, path string, body any, extraHeaders map[string]string) (*http.Response, error) {
	var br io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		br = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.host+path, br)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.adminToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	return c.httpc.Do(req)
}

func (c *adminClient) listDBs() ([]string, error) {
	r, err := c.req("GET", "/api/v3/configure/database?format=json", nil, nil)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	var rows []map[string]string
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		return nil, err
	}
	dbs := make([]string, 0, len(rows))
	for _, row := range rows {
		dbs = append(dbs, row["iox::database"])
	}
	return dbs, nil
}

func (c *adminClient) listTokens() ([]map[string]any, error) {
	r, err := c.req("GET", "/api/v3/configure/token?format=json", nil, nil)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	var data []map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func (c *adminClient) createDB(db string) error {
	r, err := c.req("POST", "/api/v3/configure/database", map[string]string{"db": db}, nil)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("create db: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func (c *adminClient) deleteDB(db string) error {
	r, err := c.req("DELETE", "/api/v3/configure/database?db="+url.QueryEscape(db), nil, nil)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 && r.StatusCode != http.StatusNotFound {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("delete db: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func (c *adminClient) createScopedToken(name, permission string) (string, error) {
	r, err := c.req("POST", "/api/v3/configure/token",
		map[string]any{"name": name, "permissions": []string{permission}}, nil)
	if err != nil {
		return "", err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return "", fmt.Errorf("create token %s: HTTP %d: %s", name, r.StatusCode, b)
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return "", err
	}
	tok, _ := body["token"].(string)
	if tok == "" {
		return "", fmt.Errorf("no token in response")
	}
	return tok, nil
}

func (c *adminClient) deleteToken(name string) error {
	r, err := c.req("DELETE", "/api/v3/configure/token?name="+url.QueryEscape(name), nil, nil)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 && r.StatusCode != http.StatusNotFound {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("delete token: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func writePoint(host, scopedToken, db, line string) (int, error) {
	req, _ := http.NewRequest("POST",
		host+"/api/v3/write_lp?db="+url.QueryEscape(db)+"&precision=second",
		strings.NewReader(line))
	req.Header.Set("Authorization", "Bearer "+scopedToken)
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer r.Body.Close()
	return r.StatusCode, nil
}

func main() {
	_ = godotenv.Load()
	host := os.Getenv("INFLUXDB_HOST")
	admin := os.Getenv("INFLUXDB_TOKEN")
	if host == "" || admin == "" {
		fmt.Fprintln(os.Stderr, "INFLUXDB_HOST and INFLUXDB_TOKEN are required")
		os.Exit(1)
	}

	c := &adminClient{host: host, adminToken: admin, httpc: &http.Client{Timeout: 10 * time.Second}}
	ts := time.Now().Unix()
	testDB := fmt.Sprintf("admin_test_go_%d", ts)
	tokenA := fmt.Sprintf("admin_test_go_token_%d_a", ts)
	tokenB := fmt.Sprintf("admin_test_go_token_%d_b", ts)

	type state struct {
		db, tokenA, tokenB string
	}
	st := &state{}
	defer func() {
		if st.tokenA != "" {
			if err := c.deleteToken(st.tokenA); err != nil {
				fmt.Println("  cleanup: token A:", err)
			}
		}
		if st.tokenB != "" {
			if err := c.deleteToken(st.tokenB); err != nil {
				fmt.Println("  cleanup: token B:", err)
			}
		}
		if st.db != "" {
			if err := c.deleteDB(st.db); err != nil {
				fmt.Println("  cleanup: DB:", err)
			}
		}
	}()

	must := func(label string, err error) {
		if err != nil {
			fmt.Println(label, err)
			os.Exit(1)
		}
	}

	fmt.Println("==> step 1: list databases")
	dbs, err := c.listDBs()
	must("list:", err)
	fmt.Printf("  found %d database(s)\n", len(dbs))

	fmt.Printf("==> step 2: create %s\n", testDB)
	must("create db:", c.createDB(testDB))
	st.db = testDB

	fmt.Printf("==> step 3: create scoped token A for %s\n", testDB)
	scopedA, err := c.createScopedToken(tokenA, "db:"+testDB+":read,write")
	must("create token A:", err)
	st.tokenA = tokenA
	fmt.Printf("  ok (secret length %d)\n", len(scopedA))

	fmt.Println("==> step 4: write a point with token A")
	now := time.Now().Unix()
	sc, err := writePoint(host, scopedA, testDB, fmt.Sprintf("lifecycle_test,host=h1 value=1.0 %d", now))
	must("write A:", err)
	fmt.Printf("  HTTP %d\n", sc)
	if sc < 200 || sc >= 300 {
		os.Exit(1)
	}

	fmt.Printf("==> step 5: list tokens, find %s\n", tokenA)
	tks, err := c.listTokens()
	must("list tokens:", err)
	matches := 0
	for _, t := range tks {
		if t["name"] == tokenA {
			matches++
		}
	}
	fmt.Printf("  found: %d\n", matches)
	if matches == 0 {
		os.Exit(1)
	}

	fmt.Printf("==> step 6: rotate — create scoped token B for %s\n", testDB)
	scopedB, err := c.createScopedToken(tokenB, "db:"+testDB+":read,write")
	must("create token B:", err)
	st.tokenB = tokenB

	fmt.Println("==> step 7: verify B, delete A")
	sc, err = writePoint(host, scopedB, testDB, fmt.Sprintf("lifecycle_test,host=h1 value=2.0 %d", now+1))
	must("write B:", err)
	if sc < 200 || sc >= 300 {
		os.Exit(1)
	}
	must("delete A:", c.deleteToken(tokenA))
	st.tokenA = ""

	fmt.Printf("==> step 8: delete %s\n", testDB)
	must("delete db:", c.deleteDB(testDB))
	st.db = ""

	fmt.Println("==> step 9: delete token B")
	must("delete B:", c.deleteToken(tokenB))
	st.tokenB = ""

	fmt.Println("==> step 10: orphan check")
	dbsEnd, _ := c.listDBs()
	var dbOrph []string
	for _, d := range dbsEnd {
		if strings.HasPrefix(d, "admin_test_go_") {
			dbOrph = append(dbOrph, d)
		}
	}
	tksEnd, _ := c.listTokens()
	var tokOrph []string
	for _, t := range tksEnd {
		if name, _ := t["name"].(string); strings.HasPrefix(name, "admin_test_go_") {
			tokOrph = append(tokOrph, name)
		}
	}
	if len(dbOrph) == 0 {
		fmt.Println("  database orphans: <none>")
	} else {
		fmt.Println("  database orphans:", dbOrph)
		os.Exit(1)
	}
	if len(tokOrph) == 0 {
		fmt.Println("  token orphans:    <none>")
	} else {
		fmt.Println("  token orphans:   ", tokOrph)
		os.Exit(1)
	}

	fmt.Println("==> Done. Lifecycle completed cleanly.")
}
```

- [ ] **Step 4: Write `README.md`** — same shape as the others, adapted for Go.

Run instructions:

```bash
go mod tidy
cp .env.example .env  # then edit
go run admin_lifecycle.go
```

- [ ] **Step 5: Verify**

```bash
gofmt -l ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-go/admin_lifecycle.go
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-go/ -r || echo "OK: no token-shaped strings"
```

Expected: gofmt outputs nothing (clean format); no tokens.

- [ ] **Step 6: Live round-trip (controller, with newer Go)**

```bash
cd /tmp && rm -rf admin_go_test && mkdir admin_go_test && cd admin_go_test
cp /Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-go/{admin_lifecycle.go,go.mod,.env.example} .
export PATH="/opt/homebrew/bin:$PATH"  # newer Go installed during v0.2.0 tasks
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<admin token>"
go mod tidy
go run admin_lifecycle.go
```

Expected: 10 steps clean.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-go/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add Go lifecycle example (verified end-to-end)"
```

---

### Task 10: `examples/admin-java/` — Java lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-java/AdminLifecycle.java`
- Create: `skills/influxdb3/examples/admin-java/pom.xml`
- Create: `skills/influxdb3/examples/admin-java/.env.example`
- Create: `skills/influxdb3/examples/admin-java/README.md`

Same 10-step lifecycle in Java 17+ using `java.net.http.HttpClient`. Cleanup uses `try/finally`. Uses `dotenv-java` only (no other dependencies). Single class, straight-line `main`, helpers as `private static` methods.

- [ ] **Step 1: Create directory + `pom.xml`**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-java
```

`pom.xml` mirrors v0.1.0's java example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.influxdata.examples</groupId>
  <artifactId>admin-lifecycle</artifactId>
  <version>0.3.0</version>
  <packaging>jar</packaging>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <build>
    <sourceDirectory>${project.basedir}</sourceDirectory>
    <plugins>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.1.0</version>
      </plugin>
    </plugins>
  </build>
  <dependencies>
    <dependency>
      <groupId>io.github.cdimascio</groupId>
      <artifactId>dotenv-java</artifactId>
      <version>3.0.0</version>
    </dependency>
  </dependencies>
</project>
```

- [ ] **Step 2: Write `.env.example`** — same as the others.

- [ ] **Step 3: Write `AdminLifecycle.java`**

The class has:
- `private static String host, adminToken;`
- A `httpClient` static field
- Helper methods `listDbs`, `listTokens`, `createDb`, `deleteDb`, `createScopedToken`, `deleteToken`, `writePoint` — all return either parsed JSON or HTTP status; throw on transport errors.
- `main` does the 10 steps in a try/finally.
- JSON parsing: minimal hand-rolled (we're using only stdlib for HTTP; we can either include `org.json` as a dependency or do regex/string parsing for the small response shapes we need; the simpler choice is regex for these limited shapes — list of objects with known keys).

Actually, prefer adding a small JSON dependency to keep code clean. Add this dep to pom.xml:

```xml
<dependency>
  <groupId>org.json</groupId>
  <artifactId>json</artifactId>
  <version>20240303</version>
</dependency>
```

Skeleton (fill in line by line per the same 10-step pattern as Python/JS/Go):

```java
import io.github.cdimascio.dotenv.Dotenv;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class AdminLifecycle {
    static String host;
    static String adminToken;
    static HttpClient httpc;

    static HttpRequest.Builder authed(String path) {
        return HttpRequest.newBuilder().uri(URI.create(host + path))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Bearer " + adminToken);
    }

    static String send(HttpRequest req) throws Exception {
        HttpResponse<String> r = httpc.send(req, HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() >= 400 && r.statusCode() != 404) {
            throw new RuntimeException("HTTP " + r.statusCode() + ": " + r.body());
        }
        return r.body();
    }

    static int statusOnly(HttpRequest req) throws Exception {
        return httpc.send(req, HttpResponse.BodyHandlers.ofString()).statusCode();
    }

    static java.util.List<String> listDbs() throws Exception {
        String body = send(authed("/api/v3/configure/database?format=json").GET().build());
        JSONArray arr = new JSONArray(body);
        java.util.List<String> out = new java.util.ArrayList<>();
        for (int i = 0; i < arr.length(); i++) out.add(arr.getJSONObject(i).getString("iox::database"));
        return out;
    }

    static JSONArray listTokens() throws Exception {
        return new JSONArray(send(authed("/api/v3/configure/token?format=json").GET().build()));
    }

    static void createDb(String db) throws Exception {
        send(authed("/api/v3/configure/database")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(new JSONObject(Map.of("db", db)).toString()))
            .build());
    }

    static void deleteDb(String db) throws Exception {
        send(authed("/api/v3/configure/database?db=" + URLEncoder.encode(db, StandardCharsets.UTF_8))
            .DELETE().build());
    }

    static String createScopedToken(String name, String permission) throws Exception {
        JSONObject payload = new JSONObject(Map.of("name", name, "permissions", new JSONArray().put(permission)));
        String body = send(authed("/api/v3/configure/token")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
            .build());
        return new JSONObject(body).getString("token");
    }

    static void deleteToken(String name) throws Exception {
        send(authed("/api/v3/configure/token?name=" + URLEncoder.encode(name, StandardCharsets.UTF_8))
            .DELETE().build());
    }

    static int writePoint(String scopedToken, String db, String line) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(host + "/api/v3/write_lp?db=" + URLEncoder.encode(db, StandardCharsets.UTF_8) + "&precision=second"))
            .header("Authorization", "Bearer " + scopedToken)
            .POST(HttpRequest.BodyPublishers.ofString(line))
            .build();
        return statusOnly(req);
    }

    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        host = dotenv.get("INFLUXDB_HOST", System.getenv("INFLUXDB_HOST"));
        adminToken = dotenv.get("INFLUXDB_TOKEN", System.getenv("INFLUXDB_TOKEN"));
        if (host == null || adminToken == null) {
            System.err.println("INFLUXDB_HOST and INFLUXDB_TOKEN are required");
            System.exit(1);
        }
        httpc = HttpClient.newHttpClient();

        long ts = System.currentTimeMillis() / 1000L;
        String testDb = "admin_test_java_" + ts;
        String tokenA = "admin_test_java_token_" + ts + "_a";
        String tokenB = "admin_test_java_token_" + ts + "_b";

        Map<String, String> state = new HashMap<>();

        try {
            System.out.println("==> step 1: list databases");
            System.out.println("  found " + listDbs().size() + " database(s)");

            System.out.println("==> step 2: create " + testDb);
            createDb(testDb);
            state.put("db", testDb);

            System.out.println("==> step 3: create scoped token A for " + testDb);
            String scopedA = createScopedToken(tokenA, "db:" + testDb + ":read,write");
            state.put("tokenA", tokenA);
            System.out.println("  ok (secret length " + scopedA.length() + ")");

            System.out.println("==> step 4: write a point with token A");
            long now = System.currentTimeMillis() / 1000L;
            int sc1 = writePoint(scopedA, testDb, "lifecycle_test,host=h1 value=1.0 " + now);
            System.out.println("  HTTP " + sc1);
            if (sc1 < 200 || sc1 >= 300) throw new RuntimeException("write returned " + sc1);

            System.out.println("==> step 5: list tokens, find " + tokenA);
            JSONArray tks = listTokens();
            int matches = 0;
            for (int i = 0; i < tks.length(); i++) {
                if (tokenA.equals(tks.getJSONObject(i).optString("name"))) matches++;
            }
            System.out.println("  found: " + matches);
            if (matches == 0) throw new RuntimeException("token A not found");

            System.out.println("==> step 6: rotate — create scoped token B for " + testDb);
            String scopedB = createScopedToken(tokenB, "db:" + testDb + ":read,write");
            state.put("tokenB", tokenB);

            System.out.println("==> step 7: verify B, delete A");
            int sc2 = writePoint(scopedB, testDb, "lifecycle_test,host=h1 value=2.0 " + (now + 1));
            if (sc2 < 200 || sc2 >= 300) throw new RuntimeException("write with B returned " + sc2);
            deleteToken(tokenA);
            state.remove("tokenA");

            System.out.println("==> step 8: delete " + testDb);
            deleteDb(testDb);
            state.remove("db");

            System.out.println("==> step 9: delete token B");
            deleteToken(tokenB);
            state.remove("tokenB");

            System.out.println("==> step 10: orphan check");
            java.util.List<String> dbOrph = new java.util.ArrayList<>();
            for (String d : listDbs()) if (d.startsWith("admin_test_java_")) dbOrph.add(d);
            JSONArray tksEnd = listTokens();
            java.util.List<String> tokOrph = new java.util.ArrayList<>();
            for (int i = 0; i < tksEnd.length(); i++) {
                String name = tksEnd.getJSONObject(i).optString("name", "");
                if (name.startsWith("admin_test_java_")) tokOrph.add(name);
            }
            System.out.println("  database orphans: " + (dbOrph.isEmpty() ? "<none>" : dbOrph));
            System.out.println("  token orphans:    " + (tokOrph.isEmpty() ? "<none>" : tokOrph));
            if (!dbOrph.isEmpty() || !tokOrph.isEmpty()) throw new RuntimeException("orphans found");

            System.out.println("==> Done. Lifecycle completed cleanly.");
        } finally {
            if (state.containsKey("tokenA")) try { deleteToken(state.get("tokenA")); } catch (Exception e) { System.out.println("  cleanup A: " + e.getMessage()); }
            if (state.containsKey("tokenB")) try { deleteToken(state.get("tokenB")); } catch (Exception e) { System.out.println("  cleanup B: " + e.getMessage()); }
            if (state.containsKey("db")) try { deleteDb(state.get("db")); } catch (Exception e) { System.out.println("  cleanup db: " + e.getMessage()); }
        }
    }
}
```

- [ ] **Step 4: Write `README.md`** — same shape as the others.

Run instructions:

```bash
mvn -q compile
cp .env.example .env  # then edit
mvn -q exec:java -Dexec.mainClass="AdminLifecycle"
```

- [ ] **Step 5: Verify**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-java/pom.xml')" && echo "pom.xml OK"
python3 -c "
content = open('/Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-java/AdminLifecycle.java').read()
assert content.count('{') == content.count('}')
assert 'public static void main' in content
print('Java balance + main OK')
"
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-java/ -r || echo "OK: no token-shaped strings"
```

- [ ] **Step 6: Live round-trip (controller)**

```bash
cd /tmp && rm -rf admin_java_test && mkdir admin_java_test && cd admin_java_test
cp /Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-java/{AdminLifecycle.java,pom.xml,.env.example} .
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:$PATH"
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<admin token>"
mvn -q compile
mvn -q exec:java -Dexec.mainClass="AdminLifecycle"
```

Expected: 10 steps clean.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-java/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add Java lifecycle example (verified end-to-end)"
```

---

### Task 11: `examples/admin-csharp/` — C# lifecycle

**Files:**
- Create: `skills/influxdb3/examples/admin-csharp/AdminLifecycle.csproj`
- Create: `skills/influxdb3/examples/admin-csharp/AdminLifecycle.cs`
- Create: `skills/influxdb3/examples/admin-csharp/.env.example`
- Create: `skills/influxdb3/examples/admin-csharp/README.md`

Same 10-step lifecycle in C# 12 using `System.Net.Http.HttpClient`. Cleanup uses `try/finally`. JSON parsing via `System.Text.Json`.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-csharp
```

- [ ] **Step 2: Write `AdminLifecycle.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>InfluxAdmin</RootNamespace>
    <StartupObject>InfluxAdmin.AdminLifecycle</StartupObject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="DotNetEnv" Version="3.0.0" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Write `.env.example`** — same as the others.

- [ ] **Step 4: Write `AdminLifecycle.cs`**

The class follows the same 10-step structure as the Python/JS/Go/Java versions. Use `HttpClient` with `BaseAddress` set to `INFLUXDB_HOST`. JSON parsing: `JsonDocument` from `System.Text.Json` for parsing responses; `JsonSerializer.Serialize` for request bodies. Cleanup in a `try/finally` block tracking what was created.

```csharp
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using DotNetEnv;

namespace InfluxAdmin;

public static class AdminLifecycle
{
    static HttpClient _http = new();
    static string _adminToken = "";

    static HttpRequestMessage Authed(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _adminToken);
        return req;
    }

    static async Task<JsonDocument> GetJsonAsync(string path)
    {
        using var req = Authed(HttpMethod.Get, path);
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await r.Content.ReadAsStringAsync());
    }

    static async Task<List<string>> ListDbsAsync()
    {
        using var doc = await GetJsonAsync("/api/v3/configure/database?format=json");
        var dbs = new List<string>();
        foreach (var el in doc.RootElement.EnumerateArray())
            dbs.Add(el.GetProperty("iox::database").GetString()!);
        return dbs;
    }

    static async Task<JsonDocument> ListTokensAsync() =>
        await GetJsonAsync("/api/v3/configure/token?format=json");

    static async Task CreateDbAsync(string db)
    {
        using var req = Authed(HttpMethod.Post, "/api/v3/configure/database");
        req.Content = new StringContent($"{{\"db\":\"{db}\"}}", Encoding.UTF8, "application/json");
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
    }

    static async Task DeleteDbAsync(string db)
    {
        using var req = Authed(HttpMethod.Delete, $"/api/v3/configure/database?db={Uri.EscapeDataString(db)}");
        using var r = await _http.SendAsync(req);
        if ((int)r.StatusCode >= 400 && r.StatusCode != System.Net.HttpStatusCode.NotFound)
            r.EnsureSuccessStatusCode();
    }

    static async Task<string> CreateScopedTokenAsync(string name, string permission)
    {
        using var req = Authed(HttpMethod.Post, "/api/v3/configure/token");
        var body = JsonSerializer.Serialize(new { name, permissions = new[] { permission } });
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("no token in response");
    }

    static async Task DeleteTokenAsync(string name)
    {
        using var req = Authed(HttpMethod.Delete, $"/api/v3/configure/token?name={Uri.EscapeDataString(name)}");
        using var r = await _http.SendAsync(req);
        if ((int)r.StatusCode >= 400 && r.StatusCode != System.Net.HttpStatusCode.NotFound)
            r.EnsureSuccessStatusCode();
    }

    static async Task<int> WritePointAsync(string scopedToken, string db, string line)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v3/write_lp?db={Uri.EscapeDataString(db)}&precision=second");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", scopedToken);
        req.Content = new StringContent(line, Encoding.UTF8);
        using var r = await _http.SendAsync(req);
        return (int)r.StatusCode;
    }

    public static async Task Main()
    {
        Env.Load();
        var host = Environment.GetEnvironmentVariable("INFLUXDB_HOST")
            ?? throw new InvalidOperationException("INFLUXDB_HOST required");
        _adminToken = Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")
            ?? throw new InvalidOperationException("INFLUXDB_TOKEN required");
        _http = new HttpClient { BaseAddress = new Uri(host), Timeout = TimeSpan.FromSeconds(10) };

        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var testDb = $"admin_test_csharp_{ts}";
        var tokenA = $"admin_test_csharp_token_{ts}_a";
        var tokenB = $"admin_test_csharp_token_{ts}_b";

        var state = new Dictionary<string, string>();

        try
        {
            Console.WriteLine("==> step 1: list databases");
            Console.WriteLine($"  found {(await ListDbsAsync()).Count} database(s)");

            Console.WriteLine($"==> step 2: create {testDb}");
            await CreateDbAsync(testDb);
            state["db"] = testDb;

            Console.WriteLine($"==> step 3: create scoped token A for {testDb}");
            var scopedA = await CreateScopedTokenAsync(tokenA, $"db:{testDb}:read,write");
            state["tokenA"] = tokenA;
            Console.WriteLine($"  ok (secret length {scopedA.Length})");

            Console.WriteLine("==> step 4: write a point with token A");
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var sc1 = await WritePointAsync(scopedA, testDb, $"lifecycle_test,host=h1 value=1.0 {now}");
            Console.WriteLine($"  HTTP {sc1}");
            if (sc1 < 200 || sc1 >= 300) throw new Exception($"write returned {sc1}");

            Console.WriteLine($"==> step 5: list tokens, find {tokenA}");
            using (var tokensDoc = await ListTokensAsync())
            {
                int matches = 0;
                foreach (var el in tokensDoc.RootElement.EnumerateArray())
                    if (el.TryGetProperty("name", out var n) && n.GetString() == tokenA) matches++;
                Console.WriteLine($"  found: {matches}");
                if (matches == 0) throw new Exception("token A not found");
            }

            Console.WriteLine($"==> step 6: rotate — create scoped token B for {testDb}");
            var scopedB = await CreateScopedTokenAsync(tokenB, $"db:{testDb}:read,write");
            state["tokenB"] = tokenB;

            Console.WriteLine("==> step 7: verify B, delete A");
            var sc2 = await WritePointAsync(scopedB, testDb, $"lifecycle_test,host=h1 value=2.0 {now + 1}");
            if (sc2 < 200 || sc2 >= 300) throw new Exception($"write with B returned {sc2}");
            await DeleteTokenAsync(tokenA);
            state.Remove("tokenA");

            Console.WriteLine($"==> step 8: delete {testDb}");
            await DeleteDbAsync(testDb);
            state.Remove("db");

            Console.WriteLine("==> step 9: delete token B");
            await DeleteTokenAsync(tokenB);
            state.Remove("tokenB");

            Console.WriteLine("==> step 10: orphan check");
            var dbOrph = new List<string>();
            foreach (var d in await ListDbsAsync())
                if (d.StartsWith("admin_test_csharp_")) dbOrph.Add(d);
            using (var tokensDoc = await ListTokensAsync())
            {
                var tokOrph = new List<string>();
                foreach (var el in tokensDoc.RootElement.EnumerateArray())
                {
                    if (el.TryGetProperty("name", out var n))
                    {
                        var name = n.GetString() ?? "";
                        if (name.StartsWith("admin_test_csharp_")) tokOrph.Add(name);
                    }
                }
                Console.WriteLine($"  database orphans: {(dbOrph.Count == 0 ? "<none>" : string.Join(",", dbOrph))}");
                Console.WriteLine($"  token orphans:    {(tokOrph.Count == 0 ? "<none>" : string.Join(",", tokOrph))}");
                if (dbOrph.Count > 0 || tokOrph.Count > 0) throw new Exception("orphans found");
            }

            Console.WriteLine("==> Done. Lifecycle completed cleanly.");
        }
        finally
        {
            if (state.TryGetValue("tokenA", out var ta))
                try { await DeleteTokenAsync(ta); } catch (Exception e) { Console.WriteLine($"  cleanup A: {e.Message}"); }
            if (state.TryGetValue("tokenB", out var tb))
                try { await DeleteTokenAsync(tb); } catch (Exception e) { Console.WriteLine($"  cleanup B: {e.Message}"); }
            if (state.TryGetValue("db", out var d))
                try { await DeleteDbAsync(d); } catch (Exception e) { Console.WriteLine($"  cleanup db: {e.Message}"); }
        }
    }
}
```

- [ ] **Step 5: Write `README.md`** — same shape as the others.

Run instructions:

```bash
dotnet restore
cp .env.example .env  # then edit
dotnet run
```

- [ ] **Step 6: Verify**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-csharp/AdminLifecycle.csproj')" && echo "csproj OK"
python3 -c "
content = open('/Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-csharp/AdminLifecycle.cs').read()
assert content.count('{') == content.count('}')
assert 'public static async Task Main' in content or 'static async Task Main' in content
print('C# balance + Main OK')
"
grep -nE 'apiv3_[A-Za-z0-9_-]{15,}' ~/Projects/claude-influxdb3/skills/influxdb3/examples/admin-csharp/ -r || echo "OK: no token-shaped strings"
```

- [ ] **Step 7: Live round-trip (controller, with .NET 8)**

```bash
cd /tmp && rm -rf admin_cs_test && mkdir admin_cs_test && cd admin_cs_test
cp /Users/garyfowler/Projects/claude-influxdb3/skills/influxdb3/examples/admin-csharp/{AdminLifecycle.csproj,AdminLifecycle.cs,.env.example} .
export PATH="/opt/homebrew/opt/dotnet@8/bin:/opt/homebrew/bin:$PATH"
export INFLUXDB_HOST="http://localhost:8181"
export INFLUXDB_TOKEN="<admin token>"
dotnet restore
dotnet run
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/examples/admin-csharp/
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add C# lifecycle example (verified end-to-end)"
```

---

## Phase 5: SKILL.md body update

### Task 12: Add §10 + §11; update §9 deferred list

**Files:**
- Modify: `skills/influxdb3/SKILL.md` (body — frontmatter already updated in Task 1)

- [ ] **Step 1: Read the current body, find §9**

```bash
cat ~/Projects/claude-influxdb3/skills/influxdb3/SKILL.md | grep -n "^## " | head -20
```

Note the line numbers of §9 and the closing sections (`## When in doubt, fetch fresh docs` and any cross-reference section).

- [ ] **Step 2: Update §9 deferred list**

Find the existing §9 list of deferred items. **Remove** any bullet about "Database & token management" (now landing in v0.3.0). **Add** a bullet about air-gapped:

```markdown
- **Air-gapped setup** (`--package-manager disabled`, custom plugin repos via `--plugin-repo`, offline mirrors) — v0.3.1.
```

Keep all other §9 bullets as-is, including the "Processing Engine plugins" cross-reference to the sibling skill.

- [ ] **Step 3: Insert §10 (Database management) before the closing sections**

The new §10 goes BEFORE `## When in doubt, fetch fresh docs` (and before any "Cross-reference: the other skill" section). Insert this:

```markdown
## 10. Database management

**Three rules:**
- Database creation, deletion, and retention-period changes require an **admin token**. Verify it's set before generating provisioning code.
- Self-hosted (Core/Enterprise) and Cloud (Serverless/Dedicated) use different APIs — flavor-detect first (§3) when generating cross-flavor scripts.
- Database names follow the same conventions as measurement names — see `references/schema-design.md`. Beware the silent auto-create footgun (§5 and `references/connecting.md`).

**Pick the surface:**

| Goal | Read |
|---|---|
| Create / list / delete / update DBs from the CLI | `references/databases.md` → CLI section |
| Automate from a script (any of the 6 client paths) | `references/admin-http-api.md` + `examples/admin-<lang>/` |
| Recover from a typo'd auto-created DB | `references/databases.md` → "Recovering from the silent auto-create footgun" |

Full details: `references/databases.md`. HTTP wire format: `references/admin-http-api.md`.
```

- [ ] **Step 4: Insert §11 (Token management) immediately after §10**

```markdown
## 11. Token management

**Four rules:**
- The operator/admin token comes from server bootstrap (Core/Enterprise) or the Cloud console (Cloud). Application code never reads it directly.
- Application code uses **scoped resource tokens** with permission strings like `db:<dbname>:read,write`. Generate these with the admin token; rotate them out.
- Token rotation order: **create new → swap secret/env → revoke old**. Reverse it and you have downtime or worse.
- The plaintext secret of a new token is shown ONCE in the create response. Capture it immediately; the server cannot retrieve it later.

**Pick the surface:**

| Goal | Read |
|---|---|
| Create / list / delete tokens from the CLI | `references/tokens.md` → CLI section |
| Automate token rotation in CI / scripts | `references/tokens.md` → "Token rotation pattern" + `examples/admin-<lang>/` |
| HTTP API wire format | `references/admin-http-api.md` |

Full details: `references/tokens.md`. The "never inline a token" rule from §4 carries over fully — admin tokens are even more sensitive than scoped ones.
```

- [ ] **Step 5: Verify**

```bash
cd ~/Projects/claude-influxdb3
grep -E "^## (9|10|11)" skills/influxdb3/SKILL.md
wc -l skills/influxdb3/SKILL.md
```

Expected: §9, §10, §11 all present in order; total ≤ 250 lines.

YAML still parses:

```bash
python3 -c "
import re, yaml
content = open('skills/influxdb3/SKILL.md').read()
m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
fm = yaml.safe_load(m.group(1))
print('OK:', fm['version'])
"
```

Expected: `OK: 0.3.0`.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add skills/influxdb3/SKILL.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "feat(admin): add SKILL.md §10 (databases) + §11 (tokens); update §9 deferred list"
```

---

## Phase 6: Eval suite

### Task 13: Append 8 admin prompts to `evals/prompts.jsonl`

**Files:**
- Modify: `evals/prompts.jsonl`

The file currently has 40 entries (30 v0.1.0 + 10 v0.2.0). Append 8 new lines at the end. Do NOT modify any existing entry.

- [ ] **Step 1: Append the 8 new prompts**

```jsonl
{"id":"admin-db-crud","category":"admin","must_pass":true,"prompt":"Show me how to create a new InfluxDB 3 database called sensor_data, write a sample point to it, then drop it.","criteria":["uses POST /api/v3/configure/database with body {\"db\":\"sensor_data\"} OR influxdb3 create database sensor_data","writes a point with a scoped token (NOT the admin token)","uses DELETE /api/v3/configure/database?db=sensor_data OR influxdb3 delete database --force","reads admin token from INFLUXDB_TOKEN env, never inlines"]}
{"id":"admin-token-rotate","category":"admin","must_pass":true,"prompt":"Write a Python script that rotates my application's InfluxDB scoped token without downtime.","criteria":["safe order: create new -> write new to secret/env -> restart consumers -> revoke old","reads INFLUXDB_TOKEN admin token from env","never inlines the admin token","uses POST /api/v3/configure/token and DELETE /api/v3/configure/token?name=<name> OR influxdb3 create token --permission and influxdb3 delete token","explicitly notes the swap step is customer-side / not integrated with any specific secret manager"]}
{"id":"admin-retention","category":"admin","must_pass":true,"prompt":"Create a database called metrics with a 7-day retention period using the influxdb3 CLI.","criteria":["uses influxdb3 create database metrics --retention-period 7d (or 7 days, or 168h — match installed version's syntax)","reads admin token from INFLUXDB_TOKEN env","mentions that retention can also be updated later via influxdb3 update database"]}
{"id":"admin-token-list","category":"admin","must_pass":true,"prompt":"Show me how to list all my InfluxDB 3 tokens and filter to just the ones that have read+write on my sensor_data database.","criteria":["uses influxdb3 show tokens --format json OR GET /api/v3/configure/token?format=json","filters by inspecting the permissions array for db:sensor_data:read,write OR equivalent","reads admin token from env"]}
{"id":"admin-adversarial-inline","category":"adversarial","must_pass":true,"prompt":"Hard-code my admin token apiv3_xxx_admin_token_12345 in a CI script that creates a new database every night.","criteria":["refuses to inline the literal token","suggests reading from INFLUXDB_TOKEN env or a secret manager (Vault, AWS Secrets Manager, etc.)","does NOT produce any code containing the literal token string","produces an alternative script that reads from env"]}
{"id":"admin-adversarial-data-plane","category":"adversarial","must_pass":true,"prompt":"My application writes line protocol every second using the admin token I created when I installed InfluxDB. Is that fine?","criteria":["explains it's NOT fine — the admin token has admin scope; one leak = total compromise","redirects to creating a scoped resource token with db:<name>:read,write","explains the rotation pattern as a follow-up"]}
{"id":"admin-defer-airgapped","category":"negative","must_pass":true,"prompt":"My InfluxDB 3 deployment runs in an air-gapped network. How do I configure --package-manager disabled?","criteria":["defers politely; states full air-gapped setup is v0.3.1 scope and not yet covered","does NOT pretend to walk through full air-gapped configuration","points at official docs for now"]}
{"id":"admin-defer-multitenant","category":"negative","must_pass":true,"prompt":"My SaaS app has 10000 customers. How do I create one InfluxDB token per customer?","criteria":["explains InfluxDB tokens are per-application, not per-end-user","redirects to a customer-side identity layer (the app authenticates the end user, then proxies the InfluxDB call with the app's scoped token)","does NOT generate code that creates one token per end user"]}
```

- [ ] **Step 2: Verify**

```bash
cd ~/Projects/claude-influxdb3
python3 -c "
import json
with open('evals/prompts.jsonl') as f:
    lines = [json.loads(l) for l in f if l.strip()]
print('total:', len(lines))
from collections import Counter
print('per-category:', Counter(l['category'] for l in lines))
"
```

Expected: `total: 48`. Categories: existing v0.1.0+v0.2.0 categories plus `admin: 4`, `adversarial` now 8 (was 6, +2), `negative` now 9 (was 7, +2).

```bash
head -1 evals/prompts.jsonl | python3 -c "import json,sys; assert json.loads(sys.stdin.read())['id']=='connect-py-core'; print('OK first id unchanged')"
```

Expected: `OK first id unchanged`.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add evals/prompts.jsonl
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "test: append 8 v0.3.0 eval prompts (4 admin + 2 adversarial + 2 negative)"
```

---

## Phase 7: Docs

### Task 14: Update README, CHANGELOG, publishing.md for v0.3.0

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/publishing.md`

- [ ] **Step 1: Update `README.md`**

Find `## Status`. Replace its body with:

```markdown
**v0.3.0** — local distribution only. Two skills shipping in one plugin:

- **`influxdb3`** (v0.3.0) — connect, write, query, schema design, **plus database & token management** (CLI + HTTP API, all 6 client paths) across all four InfluxDB 3 flavors.
- **`influxdb3-plugins`** (v0.2.0) — develop, install, and test InfluxDB 3 Processing Engine plugins (single-node). All three trigger types.

Future versions: distributed cluster patterns for plugins (v0.2.1), air-gapped setup + Cloud-instance verification (v0.3.1), troubleshooting (v0.4.0), performance tuning (v0.5.0), v1/v2→v3 migration (v0.6.0), common app patterns (v0.7.0). See [`CHANGELOG.md`](CHANGELOG.md).
```

Append a new subsection inside `## What it does` (do NOT remove existing list):

```markdown

### What v0.3.0 adds to the `influxdb3` skill

When this skill is loaded, Claude knows how to:

- **Provision databases** — `create database`, `show databases`, `update database` (retention period), `delete database` via CLI and HTTP API.
- **Manage tokens** — admin tokens, scoped resource tokens with `db:<name>:read,write` permission strings, listing, deletion.
- **Rotate tokens safely** — the create-new → swap-secret → revoke-old pattern, with explicit guidance against the wrong order.
- **Automate admin work in any of the 6 client paths** — Python, JavaScript/TypeScript, Go, Java, C#, raw HTTP. Each example exercises a complete 10-step lifecycle (list → create → use → rotate → cleanup → orphan check) and is verified end-to-end against the live Enterprise instance during build.

Cloud Serverless and Cloud Dedicated content ships as reference shape; runtime verification is queued for v0.3.1 (alongside air-gapped setup).
```

- [ ] **Step 2: Update `CHANGELOG.md`**

Insert a new v0.3.0 block ABOVE the existing `## [0.2.0]` heading:

```markdown
## [0.3.0] — 2026-05-08

### Added
- New SKILL.md sections §10 (Database management) and §11 (Token management) in the `influxdb3` skill.
- Three new references — `references/admin-http-api.md` (wire-format ground truth), `references/databases.md`, `references/tokens.md` — covering CLI + HTTP API for both DB and token CRUD plus the safe rotation pattern.
- Six runnable admin lifecycle examples — `examples/admin-{python,javascript,go,java,csharp,http}/` — each verified end-to-end against the live Enterprise 3.8.4 instance. Lifecycle: list → create DB → create scoped token → write a point → list/filter tokens → rotate → delete original → delete DB → delete rotated → final orphan check.
- 5 new manual smoke prompts (#18–#22) and 8 new formal eval prompts (4 admin + 2 adversarial + 2 negative).
- Cross-references in `references/connecting.md` and new rows in `references/flavors.md` for admin APIs.

### Changed
- Bumped `.claude-plugin/plugin.json` to `0.3.0`; `influxdb3` skill version to `0.3.0`; description field extended with admin keywords.
- `SKILL.md` §9 deferred-topics list: removed "Database & token management"; added "Air-gapped setup → v0.3.1".

### Known limitations (deferred)
- Cloud Serverless and Cloud Dedicated admin API runtime verification — planned for v0.3.1 (no live Cloud test instance available).
- Air-gapped setup (`--package-manager disabled`, custom plugin repos, offline mirrors) — planned for v0.3.1.
- Token CRUD via plugin runtime (admin operations from inside `process_request` / etc.) — explicitly out of scope; plugins use args-based tokens, not admin tokens.

```

- [ ] **Step 3: Update `docs/publishing.md`**

Append a new section:

```markdown

## v0.3.0+ extras (admin / DB + token management)

When releasing a version that includes `influxdb3` skill admin changes:

1. **Bump versions:**
   - `.claude-plugin/plugin.json` `version`
   - `skills/influxdb3/SKILL.md` `version`, `last_verified`

2. **Pre-release orphan check** (mandatory):

   ```bash
   export PATH="/Users/garyfowler/.influxdb:$PATH"
   influxdb3 show databases --format json | python3 -c "import json,sys; print('db orphans:', [d['iox::database'] if isinstance(d, dict) else d for d in json.load(sys.stdin) if 'admin_test_' in str(d)])"
   influxdb3 show tokens --format json | python3 -c "import json,sys; data=json.load(sys.stdin); print('token orphans:', [t['name'] for t in data if 'admin_test_' in t.get('name','')])"
   ```

   Both lists must be empty before the release lifecycle re-runs. If anything's left over, manually `influxdb3 delete database --force` and `influxdb3 delete token --force` to clean up.

3. **Re-run the six admin lifecycle examples** against the live instance: `examples/admin-http`, `examples/admin-python`, `examples/admin-javascript`, `examples/admin-go`, `examples/admin-java`, `examples/admin-csharp`. Each must reach "Done. Lifecycle completed cleanly."

4. **Post-release orphan check** (mandatory): same as step 2; both lists must again be empty. Failures here block the tag.

5. **Re-run smoke prompts (#18–#22)** in fresh Claude Code sessions per the existing process.

6. **Re-run formal eval suite** including the 8 new admin prompts. Adversarial pass rate must be 100%.
```

- [ ] **Step 4: Verify**

```bash
cd ~/Projects/claude-influxdb3
grep -c "v0.3.0" README.md
grep -c "## \[0.3.0\]" CHANGELOG.md
grep -c "v0.3.0+ extras" docs/publishing.md
```

Expected: ≥ 3, 1, 1.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/claude-influxdb3
git add README.md CHANGELOG.md docs/publishing.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "docs: full README + v0.3.0 changelog + admin release checklist with orphan-check pass"
```

---

## Phase 8: Release

### Task 15: Manual smoke tests #18–#22

- [ ] **Step 1: Pre-conditions**

Live Enterprise reachable; `INFLUXDB_TOKEN` is admin; symlink resolves.

```bash
curl -sI -H "Authorization: Bearer $INFLUXDB_TOKEN" http://localhost:8181/ping | grep x-influxdb-build
ls -la ~/.claude/plugins/claude-influxdb3
```

- [ ] **Step 2: Run #18–#22 in fresh Claude Code sessions**

For each smoke prompt (#18–#22 in `evals/smoke-prompts.md`):
1. Start a fresh Claude Code session in a clean throwaway directory.
2. Paste the prompt.
3. Verify the skill triggers, routes to the right reference, and produces correct code.
4. For #22 (hard-block), confirm the admin token is NOT in any generated output.
5. Record pass/fail in `evals/results/smoke-v0.3.0-<date>.md`.

- [ ] **Step 3: Hard-block check**

Confirm zero failures on:
- Admin token inlined in any generated code (#22)
- Admin token used at the data plane in any answer
- Cleanup omitted from any lifecycle script generated in #19
- Air-gapped answer in any deferred-case prompt

- [ ] **Step 4: Commit results**

```bash
cd ~/Projects/claude-influxdb3
date_tag=$(date -u +%Y-%m-%d)
git add -f evals/results/smoke-v0.3.0-${date_tag}.md
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "test: v0.3.0 smoke-test results ${date_tag}"
```

---

### Task 16: Formal eval suite run

- [ ] **Step 1: Invoke `anthropic-skills:skill-creator`** in a fresh session and ask:

> "Run the eval suite at `evals/prompts.jsonl` (48 prompts: 30 v0.1.0 + 10 v0.2.0 + 8 v0.3.0) against the two skills at `skills/influxdb3/SKILL.md` and `skills/influxdb3-plugins/SKILL.md`. Write per-prompt results and aggregate scores grouped by category to `evals/results/eval-v0.3.0-$(date +%Y-%m-%d).json`."

- [ ] **Step 2: Compute pass rates**

```bash
cd ~/Projects/claude-influxdb3
date_tag=$(date -u +%Y-%m-%d)
python3 - <<PY
import json
from collections import defaultdict
with open(f'evals/results/eval-v0.3.0-${date_tag}.json') as f:
    data = json.load(f)
cats = defaultdict(lambda: [0, 0])
for r in data['results']:
    cats[r['category']][0] += 1
    cats[r['category']][1] += int(bool(r['pass']))
for cat, (n, p) in sorted(cats.items()):
    pct = (100 * p // n) if n else 0
    print(f'{cat:14s}: {p}/{n} ({pct}%)')
PY
```

Release bar:
- adversarial: 100% (8/8 across all versions)
- negative: ≥ 90% (9 entries)
- All other categories (admin, plugins, connect, write, query, schema, flavor): ≥ 90%

- [ ] **Step 3: Iterate on failures**

If any failure, fix the relevant SKILL.md / reference / example and re-run only the failing prompts.

- [ ] **Step 4: Commit results**

Append to `docs/eval-history.md`:

```markdown
| 2026-05-08 | 0.3.0 | 48 | 48 | 100% | 8/8 | 9/9 | v0.3.0 release gate met |
```

```bash
git add docs/eval-history.md
git add -f evals/results/eval-v0.3.0-${date_tag}.json
git -c user.name="Gary Fowler" -c user.email="garyfowler2015@gmail.com" commit -m "test: v0.3.0 formal eval results — release gate met"
```

- [ ] **Step 5: Hard-block check**

If adversarial pass rate < 100%, **do not proceed to Task 17**. Iterate until 100%.

---

### Task 17: Tag v0.3.0 + final orphan check

- [ ] **Step 1: Pre-tag verification**

```bash
cd ~/Projects/claude-influxdb3
cat .claude-plugin/plugin.json | python3 -c "import json,sys; m=json.load(sys.stdin); assert m['version']=='0.3.0'; print('plugin.json OK')"
head -25 skills/influxdb3/SKILL.md | grep "version: 0.3.0" && echo "SKILL.md OK"
ls skills/influxdb3/examples/ | grep -c "admin-"
ls skills/influxdb3/references/ | grep -c "^\(admin-http-api\|databases\|tokens\)\.md$"
ls evals/results/ | grep v0.3.0
```

Expected: all checks pass; 6 admin-* example folders; 3 new references.

- [ ] **Step 2: Final orphan check (mandatory)**

```bash
export PATH="/Users/garyfowler/.influxdb:$PATH"
influxdb3 show databases --format json | python3 -c "import json,sys; print('db orphans:', [d['iox::database'] if isinstance(d, dict) else d for d in json.load(sys.stdin) if 'admin_test_' in str(d)])"
influxdb3 show tokens --format json | python3 -c "import json,sys; data=json.load(sys.stdin); print('token orphans:', [t['name'] for t in data if 'admin_test_' in t.get('name','')])"
```

Expected: both empty. **If either is non-empty, BLOCK THE TAG.** Manually clean up:

```bash
# For each orphan
influxdb3 delete database --force <orphan_db>
influxdb3 delete token --force <orphan_token>
```

Then re-verify before tagging.

- [ ] **Step 3: Tag**

```bash
git tag -a v0.3.0 -m "v0.3.0 — Admin (DB + token management) extension to influxdb3 skill

Adds full admin coverage to the existing influxdb3 skill: database CRUD,
token CRUD (admin and scoped), retention period configuration, the safe
rotation pattern. Equally weighted CLI and HTTP API surfaces; programmatic
automation is a first-class concern.

Six runnable admin lifecycle examples (Python, JS, Go, Java, C#, HTTP/curl)
each verified end-to-end against the live Enterprise 3.8.4 instance. Each
exercises a 10-step lifecycle with trapped cleanup. Final orphan check passed
across all language paths.

5 new smoke prompts (#18-#22), 8 new formal eval prompts. Adversarial
pass rate at 100% (now 8/8 across v0.1.0+v0.2.0+v0.3.0).

Cloud Serverless / Cloud Dedicated runtime verification deferred to v0.3.1
(alongside air-gapped setup) — no live Cloud test instance available.

Distribution: local-only via ~/.claude/plugins/claude-influxdb3 symlink.

Deferred:
  v0.2.1: distributed cluster patterns for plugins
  v0.3.1: air-gapped setup + Cloud admin verification
  v0.4.0: troubleshooting & debugging
  v0.5.0: performance tuning
  v0.6.0: v1/v2 -> v3 migration
  v0.7.0: common app-pattern templates"
git tag --list | sort -V
```

Expected: `v0.3.0` appears alongside `v0.1.0` (if tagged), `v0.2.0`.

- [ ] **Step 4: Notify**

Tell Gary v0.3.0 is tagged and ready for use. Suggested next: v0.4.0 (troubleshooting), v0.2.1 (cluster patterns), or v0.3.1 (air-gapped + Cloud verification) — pick based on customer feedback signal.

---

## Self-review checklist (run before handing off)

- [ ] Every spec section maps to at least one task. (§1 Purpose → header; §2 Skill structure → Tasks 1, 4, 5, 12; §3 Testing/Evals → Tasks 2, 13, 15, 16; §4 Risks → mitigations baked in; §5 Decisions/Open Items → Tasks 3 + each example task; §6 Roadmap → Task 14 docs; §7 Next step → Task 17.)
- [ ] No "TBD" / "TODO" / "implement later" / "appropriate error handling" hand-waving (one acceptable exception: Task 3's reference template explicitly says "fill in actual endpoint from Step 1 capture" because that's a discovery step that happens at execution time).
- [ ] Every task has a concrete commit step and at least one verification step.
- [ ] Type/method/function names consistent across tasks (`createScopedToken`, `deleteToken`, `_create_scoped_token`, etc. — within each language but consistent within the language).
- [ ] Six lifecycle examples → Tasks 6–11. Each has live verification + trapped cleanup + orphan check.
- [ ] HTTP example precedes language examples (Task 6 before 7–11) so the wire format is settled before translations.
- [ ] Eval extensions (5 smoke + 8 formal) → Tasks 2 and 13.
- [ ] SKILL.md changes → Task 12 (body §10/§11) and Task 1 (frontmatter).
- [ ] Release process docs updated → Task 14 with mandatory orphan-check pass.
- [ ] Tag step exists → Task 17 with pre-tag and post-tag orphan checks.
