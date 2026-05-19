---
name: influxdb3
description: |
  Use when the developer is writing or modifying code that connects to,
  reads from, writes to, or designs schemas for InfluxDB 3 (Core, Enterprise,
  Cloud Serverless, or Cloud Dedicated), OR when provisioning databases,
  creating, rotating, listing, or deleting auth tokens (admin tokens, operator
  tokens, scoped resource tokens with permission strings like
  db:<dbname>:read,write), configuring retention periods, or automating any
  of the above via CLI or HTTP API. Also triggers on troubleshooting
  language — HTTP 401/403/404 errors, line protocol parse errors, queries
  returning no rows, token rotation issues, silent auto-create misroutes,
  and other "why isn't this working" symptoms. Triggers on imports of any
  official InfluxDB 3 client (influxdb3-python, @influxdata/influxdb3-client,
  influxdb3-go, influxdb3-java, InfluxDB3.Client), references to line
  protocol, v3 SQL queries, or .env keys like INFLUXDB_HOST / INFLUXDB_TOKEN /
  INFLUXDB_DATABASE; AND admin keywords like influxdb3 create token,
  influxdb3 create database, influxdb3 show tokens, regenerate operator
  token, /api/v3/configure/token, and /api/v3/configure/database. Distinct
  from the influxdb3-plugins skill, which covers code that runs INSIDE
  InfluxDB.
version: 0.5.2
last_verified: "2026-05-15"
verified_against:
  influxdb3_core: "3.8"
  influxdb3_enterprise: "3.8"
  influxdb3_python: "0.19"
  influxdb3_javascript: "2.2"
  influxdb3_go: "2.14"
  influxdb3_java: "1.9"
  influxdb3_csharp: "1.8"
---

# InfluxDB 3 Skill

## 1. What this skill is for

This skill teaches Claude to write correct InfluxDB 3 code for **connect & authenticate, write data, query data, and schema design** across all four flavors (Core, Enterprise, Cloud Serverless, Cloud Dedicated), in Python, JavaScript/TypeScript, Go, Java, C#, and raw HTTP.

It is for **InfluxDB 3** specifically — not 1.x or 2.x. If the developer is migrating from v1/v2, defer politely; migration support is on the roadmap.

This skill stands alone — it does not require the InfluxDB 3 MCP server. If the MCP server is also installed, the skill complements it.

## 1.5. Don't have an instance yet?

If the developer says they don't have InfluxDB 3 running anywhere yet, walk them through getting one before §2 — `references/installing.md` covers Core and Enterprise install (script and Docker), bootstrapping the operator token, and verifying with `/ping`.

For Cloud Serverless or Cloud Dedicated, the install path is signing up at https://www.influxdata.com/products/influxdb-overview/. Claude does not create accounts on the user's behalf — direct them to sign up themselves, then continue with §2 once they have credentials.

## 2. First-time setup checklist

> **STOP and check the prerequisites BEFORE writing any application code.** The most common skill failure is jumping straight to "write me a Python script" without confirming the database and token exist. This produces code that *appears* to work — InfluxDB 3 silently auto-creates databases on first write — but routes data to the wrong DB on a typo, or fails authorization on the wrong host.

### Required preconditions checklist

Before you generate any application code, walk the developer through these and confirm each one is true:

- [ ] **Server is running and reachable.** `curl <host>/ping` returns 200 with `x-influxdb-build` header.
- [ ] **Admin token exists.** For Core/Enterprise, this is the operator token shown when the server first started, or one you generated with `influxdb3 create token --admin`. For Cloud, this is your Cloud-Console-generated management token.
- [ ] **Target database exists.** Confirm with `influxdb3 show databases --token <admin-token>` or `GET /api/v3/configure/database?format=json`. If it doesn't, create it: `influxdb3 create database <name> --token <admin-token>` or `POST /api/v3/configure/database` with body `{"db":"<name>"}`.
- [ ] **Application token exists** with read+write on that database. Best practice: a *scoped* token, not the admin token. `influxdb3 create token --permission "db:<name>:read,write" --token <admin-token>`.
- [ ] **`.gitignore` excludes `.env`.**
- [ ] **`.env.example` is committed**; `.env` is NOT committed.
- [ ] **Env vars set:** `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` (and `INFLUXDB_ORG` only for Cloud Serverless writes).

If the developer says *"I just spun up Core/Enterprise"*, **none of the above are guaranteed yet** — walk through them before writing any code.

### Why this is a hard gate (the silent-success footgun)

InfluxDB 3 will silently **auto-create a database** on the first successful write, with the default config. So a script that targets a misnamed database (e.g. `senor_data` instead of `sensor_data`) will report success — but the data lands in a brand-new, wrong database. The only protection is verifying the database exists explicitly *before* the first write. **Do not skip this step**, even when the developer's prompt is "just write me the script."

### Order of operations (Core / Enterprise self-hosted)

1. Start server → 2. Create admin token (bootstrap, no existing token needed) → 3. Create database → 4. (Recommended) Create scoped app token → 5. Set env vars → 6. Generate code.

### Order of operations (Cloud Serverless / Cloud Dedicated)

The server is managed by InfluxData. Use the Cloud UI / management API to: create the database/bucket → create a scoped token. Then set env vars and generate code.

Full detail and copy-paste-ready commands: `references/connecting.md`.

## 3. Flavor detection

Probe `/ping` first; ask only if detection is ambiguous.

1. `GET <host>/ping` with `Authorization: Bearer $INFLUXDB_TOKEN`.
2. Inspect the `x-influxdb-build` response header for `"Enterprise"` or `"Core"` (case-insensitive substring).
3. If the build header is absent or says `"cloud"`, follow up with: `GET /api/v3/configure/retention_period` (404 → Core; 403 → Enterprise) and the Cloud Serverless / Cloud Dedicated probes.
4. Match priority: **Cloud Dedicated → Cloud Serverless → Enterprise → Core → Clustered**.
5. If the probe is inconclusive, fall back to: *"I couldn't detect your InfluxDB 3 flavor from `/ping`. Which one are you targeting?"*

Full logic, snippets, and provenance: `references/flavor-detection.md`. Per-flavor differences: `references/flavors.md`.

## 4. Connecting & authenticating

**The five rules:**
1. Never inline a token.
2. Always use env vars in production code.
3. Use `.env` for local development.
4. Add `.env` to `.gitignore` first.
5. Ship `.env.example`, never `.env`.

**Pick the language:**

| Developer is using… | Read |
|---|---|
| Python | `references/clients/python.md` + `examples/python/hello.py` |
| JavaScript / TypeScript | `references/clients/javascript.md` + `examples/javascript/hello.js` |
| Go | `references/clients/go.md` + `examples/go/hello.go` |
| Java | `references/clients/java.md` + `examples/java/Hello.java` |
| C# | `references/clients/csharp.md` + `examples/csharp/Hello.cs` |
| Anything else, or wants raw HTTP | `references/clients/http.md` + `examples/http/hello.sh` |

Full auth details and `.env`-loader snippets per language: `references/connecting.md`.

## 5. Writing data

**Four rules:**
- **Verify the database exists before the first write.** v3 silently auto-creates databases on first write, which masks typos — a misspelled `INFLUXDB_DATABASE` becomes a brand-new empty DB with no error. Either create the DB explicitly during setup (§2) or have generated code list databases at startup and abort with a clear error if the target isn't there.
- Use line protocol — never invent a "JSON write" path; v3 ingests line protocol.
- Batch writes — ≥ 1,000 points or 1-second flush, whichever first.
- Distinguish retriable (5xx, 429) from non-retriable (400, 401, 404) errors.

For depth: `references/writing.md`. For per-language batch-write code: same router as §4. For the auto-create footgun and the explicit "verify database exists" recipe: `references/connecting.md` → "The silent auto-create footgun".

## 6. Querying data

**Three rules:**
- SQL is primary in v3. Generate SQL by default.
- InfluxQL is for v1/v2 compatibility only. If asked, push back gently.
- Always parameterize user input. Never string-concatenate.

For depth (time idioms with `DATE_BIN`, pagination, parameterization per language): `references/querying.md`.

## 7. Schema design

**Three rules:**
- **Tags** are indexed identity — small, bounded sets of values used for `GROUP BY` and filtering.
- **Fields** are measurement values — anything that varies over time, and anything high-cardinality.
- **High-cardinality identifiers (UUIDs, user IDs, request IDs) are fields, not tags.**

For the cardinality decision rule, naming conventions, and common-mistakes section: `references/schema-design.md`.

## 8. When in doubt, fetch fresh docs

If a question lands outside what's baked in — for example, a recent client API change, a less-common SQL function, or a flavor-specific endpoint nuance — WebFetch from a curated URL in `references/doc-urls.md`. Do not invent URLs.

## 9. What this skill does NOT cover (v1.0)

If the developer asks for any of the following, defer politely and explain it's on the roadmap:

- **Air-gapped setup** (`--package-manager disabled`, custom plugin repos via `--plugin-repo`, offline mirrors) — v0.3.1.
- **Performance tuning** (slow queries, slow writes, cardinality remediation, batch-size optimization) — v0.5.0.
- **v1/v2 → v3 migration** — v1.2.
- **App-pattern templates** (IoT pipelines, dashboards, alerts/downsampling) — v1.3.
- **Processing Engine plugins** (Python code that runs inside InfluxDB 3 — `process_writes`, `process_scheduled_call`, `process_request` triggers, `influxdb3_local` API, `LineBuilder`) — see the sibling `influxdb3-plugins` skill (v0.2.0+).

Sample deferral:

> "This skill is focused on connect/auth, writes, queries, and schema design. <Topic> is on the roadmap but not yet covered. For now, the official docs at <relevant URL from doc-urls.md> are the best resource."

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
| HTTP API wire format (note: Core and Enterprise use different paths for resource tokens) | `references/admin-http-api.md` |

Full details: `references/tokens.md`. The "never inline a token" rule from §4 carries over fully — admin tokens are even more sensitive than scoped ones.

## 12. Troubleshooting & debugging

When something stopped working — connection errors, writes not landing where expected, queries returning 0 rows, token rotation aftermath, admin operations failing.

**Four rules:**
- **Redact first, diagnose second.** If the customer pasted a real-looking token (regex `apiv3_[A-Za-z0-9_-]{30,}`), acknowledge the leak, recommend immediate rotation via `references/tokens.md`, then proceed without echoing **any portion** of the token — not the full string, not a prefix, not a suffix, not a "first 8 characters" sample. Refer to it as "the token in your error" or `<redacted>`.
- **Always check for silent auto-create misroute** when a write "succeeded" but the data isn't visible — list databases the token can see and look for typo'd siblings (`references/troubleshooting.md` → "Silent auto-create misroute").
- **Run the diagnostic toolkit** at `examples/diagnose/` when the symptom is unclear. It produces a one-page health report that's the right thing to paste into Claude.
- **Defer performance questions** to v0.5.0 — slow query / slow write / cardinality remediation are out of scope here. Quick triage (add a time filter, add a LIMIT, batch in 1k–10k chunks) is fine; deeper analysis defers.

**Symptom → section:**

| Symptom | Read |
|---|---|
| 401 / 403 from any operation | `references/troubleshooting.md` → "Auth failures" |
| Write succeeded but data isn't where I expect | `references/troubleshooting.md` → "Silent auto-create misroute" |
| Write fails with 400 | `references/troubleshooting.md` → "Write failures" (note: whole batch rejects on one bad line) |
| Query returns 0 rows / wrong rows | `references/troubleshooting.md` → "Query failures" |
| Token rotation broke my CI | `references/troubleshooting.md` → "Admin failures" |
| Plugin trigger never fires / errors in logs | sibling skill `influxdb3-plugins` → its troubleshooting reference |
| "This behaves weirdly but the docs don't say why" | `references/quirks.md` |

For broken→fix code patterns, see `examples/troubleshooting/`. Full reference: `references/troubleshooting.md`. Quirk catalogue: `references/quirks.md`.
