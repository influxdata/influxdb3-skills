# InfluxDB 3 Flavors

This table compares InfluxDB 3 Core, InfluxDB 3 Enterprise, InfluxDB Cloud Serverless, and InfluxDB Cloud Dedicated. For InfluxDB 3 Cloud and InfluxDB Clustered, check their docs. Only InfluxDB 3 Core, InfluxDB 3 Enterprise, and InfluxDB 3 Cloud have `/api/v3` endpoints.
InfluxDB Cloud Serverless and InfluxDB Cloud Dedicated have none.
Most code is portable across flavors when host and token are env-driven; this reference exists for the cases where they actually differ.

## Comparison table

| Dimension | Core | Enterprise | Cloud Serverless | Cloud Dedicated |
|---|---|---|---|---|
| **Default port** | `8181` | `8181` (per node) | 443 (TLS) | 443 (TLS) |
| **Host pattern** | configurable, often `localhost:8181` | configurable cluster | `https://<region>-<id>.cloud2.influxdata.com` | customer-specific hostname |
| **Token type** | admin tokens only | admin + resource (database, system) tokens | management + database tokens | management + database tokens |
| **Write endpoint** | `POST /api/v3/write_lp` | `POST /api/v3/write_lp` | `POST /api/v2/write` (or v1 `/write`) | `POST /api/v2/write` (or v1 `/write`) |
| **Query** | `/api/v3/query_sql`, `/api/v3/query_influxql`, or Flight | Same as Core | Flight (SQL or InfluxQL), or v1 `/query` (InfluxQL) | Same as Cloud Serverless |
| **Multi-database** | yes | yes | yes (per bucket) | yes |
| **Database creation** | HTTP API or CLI | HTTP API or CLI | UI / API (cloud-managed) | UI / API (cloud-managed) |
| **Database creation API** | `POST /api/v3/configure/database` (HTTP) or `influxdb3 create database` (CLI) | Same as Core | Product UI or management API | Product UI or management API |
| **Token creation API** | Admin only: `POST /api/v3/configure/token/named_admin` (HTTP) or `influxdb3 create token --admin` (CLI) | Admin: same as Core. Resource: `POST /api/v3/enterprise/configure/token` or `influxdb3 create token --permission` | Product UI or management API | Product UI or management API |

## Notable per-flavor gotchas

### Core
Single-node, open source. Admin tokens only: no resource tokens and no RBAC (`references/tokens.md` → "InfluxDB 3 Core: admin tokens only"). Default object-store is local disk; `--object-store=memory` is fine for testing only.

### Enterprise
Multi-node cluster with replication. Adds resource tokens with per-database and system permissions. User authentication and RBAC are a preview in 3.10.0 and later, off by default. Otherwise the same v3 HTTP API as Core; the other differences are operational (cluster, observability) rather than client-facing.

### Cloud Serverless
No `/api/v3` endpoints. Write through `/api/v2/write`.
Query through Flight with the InfluxDB 3 client libraries, or with InfluxQL over the v1 `/query` endpoint.

### Cloud Dedicated
Same write and query paths as Cloud Serverless.
The host is customer-specific, and tokens are managed in the Cloud Dedicated console.

## When to ask the developer

Ask explicitly which flavor they're targeting only if `references/flavor-detection.md`'s `/ping` probe returns ambiguous output **and** the answer would change the generated code (e.g., write endpoint differs). For most read code, you can generate flavor-agnostic code via env vars and skip the question.
