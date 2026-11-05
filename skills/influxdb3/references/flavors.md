# InfluxDB 3 flavors

This skill covers InfluxDB 3 Core, InfluxDB 3 Enterprise, and InfluxDB 3 Cloud.
InfluxDB 3 Cloud is hosted InfluxDB 3 Enterprise.
It uses Enterprise's API and token model where the InfluxDB 3 Cloud docs confirm it.
Most code is portable across Core and Enterprise when host and token come from env vars.
This reference covers the cases where they differ.

## Products this skill doesn't cover

InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered are separate products.
They have no `/api/v3/*` endpoints, so code that calls `/api/v3/*` fails there.
Their tokens and databases also work differently.
Route questions about them to their docs in [`references/doc-urls.md`](doc-urls.md), and don't apply this skill's commands or endpoints.

## Comparison table

| Dimension | Core | Enterprise |
|---|---|---|
| **Default port** | `8181` | `8181` (per node) |
| **Host pattern** | configurable, often `localhost:8181` | configurable cluster |
| **Token type** | admin tokens only | admin + resource (database, system) tokens |
| **Write endpoint** | `POST /api/v3/write_lp` | `POST /api/v3/write_lp` |
| **Query** | `/api/v3/query_sql`, `/api/v3/query_influxql`, or Flight | Same as Core |
| **Database creation** | `POST /api/v3/configure/database` (HTTP) or `influxdb3 create database` (CLI) | Same as Core |
| **Token creation API** | Admin only: `POST /api/v3/configure/token/named_admin` (HTTP) or `influxdb3 create token --admin` (CLI) | Admin: same as Core. Resource: `POST /api/v3/enterprise/configure/token` or `influxdb3 create token --permission` |

## Notable per-flavor gotchas

### Core
Single-node, open source. Admin tokens only: no resource tokens and no RBAC ([`references/tokens.md` → "InfluxDB 3 Core: admin tokens only"](tokens.md#influxdb-3-core-admin-tokens-only)). `--object-store` is required with no default (3.2.1+).

### Enterprise
Single node or multi-node cluster, with replication. Adds resource tokens with per-database and system permissions.
The 3.12.0 release notes make user authentication and RBAC generally available; they remain opt-in, and custom role authoring remains disabled by default.
Existing token workflows remain supported. User and role administration beyond the existing token guidance belongs in the Enterprise docs.

## When to ask the developer

Ask explicitly which flavor they're targeting only if [`references/flavor-detection.md`](flavor-detection.md)'s `/ping` probe returns ambiguous output **and** the answer would change the generated code (e.g., write endpoint differs). For most read code, you can generate flavor-agnostic code via env vars and skip the question.
