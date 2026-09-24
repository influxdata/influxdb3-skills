---
name: influxdb3
description: |
  Use when the developer is writing or modifying code that connects to,
  reads from, writes to, or designs schemas for InfluxDB 3 Core, InfluxDB 3
  Enterprise, InfluxDB 3 Cloud, InfluxDB Cloud Serverless, InfluxDB Cloud
  Dedicated, or InfluxDB Clustered, OR when provisioning databases,
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
  InfluxDB. Not for InfluxDB Cloud (TSM), InfluxDB Cloud 1, InfluxDB OSS v1,
  or InfluxDB OSS v2.
metadata:
  version: "0.6.0"
  docs_checked: "2026-09-23"
  docs_checked_against: "influxdb3-core 3.11.5, influxdb3-enterprise 3.11.5"
  live_verified: "2026-05-24"
  live_verified_against: "influxdb3-core 3.9, influxdb3-enterprise 3.9"
  clients_verified_against: "influxdb3-python 0.19, influxdb3-js 2.2, influxdb3-go 2.14, influxdb3-java 1.9, influxdb3-csharp 1.8"
---

# InfluxDB 3 Skill

## 1. What this skill is for

This skill teaches Claude to write correct InfluxDB 3 code for **connect & authenticate, write data, query data, and schema design**, in Python, JavaScript/TypeScript, Go, Java, C#, and raw HTTP.

**Products and depth:**

| Product | Coverage |
|---|---|
| InfluxDB 3 Core, InfluxDB 3 Enterprise | Full guidance in this skill. |
| InfluxDB 3 Cloud (hosted InfluxDB 3 Enterprise) | Enterprise guidance for writes, queries, and tokens, only where the InfluxDB 3 Cloud docs confirm it. |
| InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, InfluxDB Clustered | Client-library write and query patterns. For tokens, databases, and anything product-specific, route to that product's docs. |

**Always use the full product name.**
"Cloud" alone can mean several different products.
If the developer says only "Cloud," ask which product they use.

**Out of scope:** InfluxDB Cloud (TSM), InfluxDB Cloud 1, InfluxDB OSS v1, and InfluxDB OSS v2.
Say that this skill doesn't cover them, and point to that product's docs.
If the InfluxDB docs MCP server is connected, use it: it answers questions about every InfluxDB product and version.
Migration from v1 or v2 is also out of scope.

This skill stands alone — it does not require the InfluxDB 3 MCP server. If the MCP server is also installed, the skill complements it.

## 1.5. Don't have an instance yet?

If the developer says they don't have InfluxDB 3 running anywhere yet — *or already has the binary installed but no server running* — walk them through starting one before §2. `references/installing.md` covers Core and Enterprise install (script and Docker), choosing an object store, bootstrapping the operator token, and verifying with `/ping`.

Two things to get right before issuing a start command (both detailed in `references/installing.md`):
- **Enterprise needs a license.** A bare `serve` fails fast with `No interactive TTY detected. Cannot prompt for email.` — ask the developer for their license email and type, then pass `--license-email` + `--license-type`.
- **Pick the object store.** Default is `file` (needs `--data-dir`); `memory` is RAM-only and unsafe for sustained writes or restarts.

For InfluxDB 3 Cloud, InfluxDB Cloud Serverless, or InfluxDB Cloud Dedicated, the developer signs up at https://www.influxdata.com/products/influxdb-overview/. Claude does not create accounts on the user's behalf — direct them to sign up themselves, then continue with §2 once they have credentials. For InfluxDB Clustered, route to its install docs.

## 2. First-time setup checklist

> **STOP and check the prerequisites BEFORE writing any application code.** The most common skill failure is jumping straight to "write me a Python script" without confirming the database and token exist. This produces code that *appears* to work — InfluxDB 3 silently auto-creates databases on first write — but routes data to the wrong DB on a typo, or fails authorization on the wrong host.

### Required preconditions checklist

Before you generate any application code, walk the developer through these and confirm each one is true:

- [ ] **Server is running and reachable.** `curl <host>/ping` returns 200 with `x-influxdb-build` header.
- [ ] **Admin token exists.** For Core/Enterprise, this is the operator token shown when the server first started, or one you generated with `influxdb3 create token --admin`. For any other product, follow that product's token docs.
- [ ] **Target database exists.** Confirm with `influxdb3 show databases --token <admin-token>` or `GET /api/v3/configure/database?format=json`. If it doesn't, create it: `influxdb3 create database <name> --token <admin-token>` or `POST /api/v3/configure/database` with body `{"db":"<name>"}`.
- [ ] **Application token exists** with read+write on that database. Best practice: a *scoped* token, not the admin token. `influxdb3 create token --permission "db:<name>:read,write" --token <admin-token>`.
- [ ] **`.gitignore` excludes `.env`.**
- [ ] **`.env.example` is committed**; `.env` is NOT committed.
- [ ] **Env vars set:** `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` (and `INFLUXDB_ORG` only for InfluxDB Cloud Serverless writes).

If the developer says *"I just spun up Core/Enterprise"*, **none of the above are guaranteed yet** — walk through them before writing any code.

### Why this is a hard gate (the silent-success footgun)

InfluxDB 3 will silently **auto-create a database** on the first successful write, with the default config. So a script that targets a misnamed database (e.g. `senor_data` instead of `sensor_data`) will report success — but the data lands in a brand-new, wrong database. The only protection is verifying the database exists explicitly *before* the first write. **Do not skip this step**, even when the developer's prompt is "just write me the script."

### Order of operations (Core / Enterprise self-hosted)

1. Start server → 2. Create admin token (bootstrap, no existing token needed) → 3. Create database → 4. (Recommended) Create scoped app token → 5. Set env vars → 6. Generate code.

### Order of operations (other InfluxDB 3 products)

For InfluxDB 3 Cloud, InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered, the order is the same: create the database (or bucket) → create a scoped token → set env vars → generate code. Each product has its own UI or management API for the first two steps. Route to that product's docs for them.

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
- Distinguish retriable (5xx, 429) from non-retriable (400, 401, 403, 404) errors. A 400 from `/api/v3/write_lp` can be a partial write: the valid lines are already stored, so resend only the rejected lines. Recent official clients write through `/api/v2/write` by default, where one invalid line rejects the whole batch (`references/writing.md`).

For depth: `references/writing.md`. For per-language batch-write code: same router as §4. For the auto-create footgun and the explicit "verify database exists" recipe: `references/connecting.md` → "The silent auto-create footgun".

## 6. Querying data

**Three rules:**
- SQL is primary in v3. Generate SQL by default.
- InfluxQL is for v1/v2 compatibility only. If asked, push back gently.
- Always parameterize user input. Never string-concatenate.

For depth (time idioms with `DATE_BIN`, pagination, parameterization per language): `references/querying.md`.

## 7. Schema design

**Three rules:**
- **Tags** identify the data's source or context: `host`, `region`, device IDs. A row's identity is its table, tags, and timestamp.
- **Fields** hold measured values.
- **An identifier that tells sources apart is a tag, not a field.** InfluxDB 3 has no tag-cardinality limit, so InfluxDB v1/v2 cardinality advice doesn't apply.

For the decision rule, naming conventions, and common mistakes: `references/schema-design.md`.

## 8. When in doubt, fetch fresh docs

If a question lands outside what's baked in — for example, a recent client API change, a less-common SQL function, or a flavor-specific endpoint nuance — look it up in this order:

1. The InfluxDB docs MCP server (`search_influxdata_knowledge_sources`), if it's connected.
2. For live state on the user's instance (databases, tokens, schema, query results), the `influxdb3` CLI or the InfluxDB 3 MCP server, if it's connected.
3. A curated URL in `references/doc-urls.md`. Don't invent URLs.

Neither MCP server is required.

**Don't state version-sensitive values from memory.** Flags, defaults, limits, and endpoints change between releases.
Look them up in the docs for the user's product and version.
`influxdb3 <command> --help` shows which flags the user's binary accepts, but its descriptions and defaults can be wrong.

**Trust the docs until observed behavior contradicts them.** If the user's server behaves differently from the docs, report what the server did, with the product and version, and say that it differs from the docs. Don't silently pick one.
If only `--help` text disagrees with the docs, neither is proven. Say so, and recommend a behavior test or a question to InfluxData support.

## 9. What this skill does NOT cover

If the developer asks for any of the following, say that this skill doesn't cover it and point to the docs:

- **Air-gapped setup** (custom plugin repos via `--plugin-repo`, offline mirrors). To block plugin package installation, see the sibling `influxdb3-plugins` skill → `references/dependencies.md`.
- **Performance tuning** (slow queries, slow writes, cardinality remediation, batch-size optimization).
- **v1/v2 → v3 migration.**
- **App-pattern templates** (IoT pipelines, dashboards, alerts/downsampling).
- **Processing Engine plugins** (Python code that runs inside InfluxDB 3 — `process_writes`, `process_scheduled_call`, `process_request` triggers, `influxdb3_local` API, `LineBuilder`) — see the sibling `influxdb3-plugins` skill.

Sample deferral:

> "This skill is focused on connect/auth, writes, queries, and schema design. <Topic> isn't covered here. The official docs at <relevant URL from doc-urls.md> are the best resource."

## 10. Database management

**Three rules:**
- Database creation, deletion, and retention-period changes require an **admin token**. Verify it's set before generating provisioning code.
- InfluxDB 3 Core and Enterprise use the APIs in this skill. InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered use different management APIs. For InfluxDB 3 Cloud, check its docs. Route to that product's docs, and flavor-detect first (§3) when generating cross-product scripts.
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
- The operator/admin token comes from server bootstrap (Core/Enterprise) or, for other products, from the process that product's docs describe. Application code never reads it directly.
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
- **Defer performance questions** — slow query / slow write / cardinality remediation are out of scope here. Quick triage (add a time filter, add a LIMIT, batch in 1k–10k chunks) is fine; deeper analysis defers.

**Symptom → section:**

| Symptom | Read |
|---|---|
| 401 / 403 from any operation | `references/troubleshooting.md` → "Auth failures" |
| Write succeeded but data isn't where I expect | `references/troubleshooting.md` → "Silent auto-create misroute" |
| Write fails with 400 | `references/troubleshooting.md` → "Write failures" (note: on `/api/v3/write_lp` with the default `accept_partial=true`, the valid lines were written; the compatibility endpoints reject the whole batch) |
| Query returns 0 rows / wrong rows | `references/troubleshooting.md` → "Query failures" |
| Token rotation broke my CI | `references/troubleshooting.md` → "Admin failures" |
| Plugin trigger never fires / errors in logs | sibling skill `influxdb3-plugins` → its troubleshooting reference |
| "This behaves weirdly but the docs don't say why" | `references/quirks.md` |

For broken→fix code patterns, see `examples/troubleshooting/`. Full reference: `references/troubleshooting.md`. Quirk catalogue: `references/quirks.md`.
