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

If the developer is starting fresh in a project (no `.env`, no client imports), walk through these six steps before generating application code:

1. **Pick the flavor** — Core, Enterprise, Cloud Serverless, or Cloud Dedicated. If unknown, see §3 for `/ping`-based detection or ask. See `references/flavors.md`.
2. **Create a token** — for the chosen flavor; link the developer to the relevant page on docs.influxdata.com from `references/doc-urls.md`.
3. **Verify `.gitignore` excludes `.env`** — non-negotiable.
4. **Create `.env.example`** with `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` (and `INFLUXDB_ORG` only if Cloud Serverless writes).
5. **Create `.env`** by copying `.env.example` and filling in real values. Confirm `git status` does NOT show `.env`.
6. **Pick the client library** (§4 router), generate the hello-world, run it.

Full detail: `references/connecting.md`.

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

**Three rules:**
- Use line protocol — never invent a "JSON write" path; v3 ingests line protocol.
- Batch writes — ≥ 1,000 points or 1-second flush, whichever first.
- Distinguish retriable (5xx, 429) from non-retriable (400, 401, 404) errors.

For depth: `references/writing.md`. For per-language batch-write code: same router as §4.

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

Sample deferral:

> "This skill is focused on connect/auth, writes, queries, and schema design. <Topic> is on the roadmap but not yet covered. For now, the official docs at <relevant URL from doc-urls.md> are the best resource."
