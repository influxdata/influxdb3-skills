---
name: influxdb3
description: Use when the developer is writing or modifying code that connects
  to, reads from, writes to, or designs schemas for InfluxDB 3 (Core, Enterprise,
  Cloud Serverless, or Cloud Dedicated). Triggers on imports of any official
  InfluxDB 3 client (influxdb3-python, @influxdata/influxdb3-client,
  influxdb3-go, influxdb3-java, InfluxDB3.Client), references to line protocol,
  v3 SQL queries, or .env keys like INFLUXDB_HOST / INFLUXDB_TOKEN /
  INFLUXDB_DATABASE.
version: 0.1.0
last_verified: 2026-04-29
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

- **Database & token management** (creating DBs, listing/rotating tokens) — v1.1.
- **Troubleshooting & debugging** ("why isn't my write showing up?") — v1.1.
- **Performance tuning** (deep batching strategies, query plan analysis) — v1.1.
- **v1/v2 → v3 migration** — v1.2.
- **App-pattern templates** (IoT pipelines, dashboards, alerts/downsampling) — v1.3.
- **Processing Engine plugins** (Python code that runs inside InfluxDB 3 — `process_writes`, `process_scheduled_call`, `process_request` triggers, `influxdb3_local` API, `LineBuilder`) — see the sibling `influxdb3-plugins` skill (v0.2.0+).

Sample deferral:

> "This skill is focused on connect/auth, writes, queries, and schema design. <Topic> is on the roadmap but not yet covered. For now, the official docs at <relevant URL from doc-urls.md> are the best resource."
