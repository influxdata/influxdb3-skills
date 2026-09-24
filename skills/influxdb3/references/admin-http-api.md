# Admin HTTP API — Endpoint Reference

This is the wire-format ground truth for InfluxDB 3 admin operations. Per-language admin examples (`examples/admin-<lang>/`) translate from this reference.

> **Verified against InfluxDB 3 Enterprise 3.8.4 on 2026-05-08** by direct HTTP probing during v0.3.0 build. Cells marked *(per influxdb3_ui source)* are documented from the InfluxData internal Explorer source code; runtime verification is queued for v0.3.1. Cloud Serverless / Cloud Dedicated have separate management APIs — see `references/flavors.md` for the per-flavor map.

## Auth

All admin endpoints require: `Authorization: Bearer <admin-token>`. The admin token comes from server bootstrap (Core/Enterprise) or, for other products, from the process that product's docs describe. **Never inline.** Read from `INFLUXDB_TOKEN` env or a secret manager.

## Database operations

Database CRUD is identical across Core and Enterprise (verified against Enterprise; Core paths are the same per source).

### List databases

```
GET /api/v3/configure/database?format=json
Authorization: Bearer <admin-token>
```

**Response (200):** JSON array of objects.

```json
[
  {"iox::database": "my_db"},
  {"iox::database": "_internal"}
]
```

### Create database

```
POST /api/v3/configure/database
Authorization: Bearer <admin-token>
Content-Type: application/json

{"db": "<name>"}
```

**Response:** `200`, empty body. `409` if the database already exists.

### Delete database

```
DELETE /api/v3/configure/database?db=<name>
Authorization: Bearer <admin-token>
```

**Response:** `200`, empty body.

### Update retention period

Use the CLI: `influxdb3 update database --database <name> --retention-period <duration>` (e.g., `30d`, `24h`, or `none` to clear). The HTTP body shape for retention is not documented in the surface we audited — for v0.3.0, the recommended path is the CLI.

## Token operations

> **Resource (scoped) tokens are Enterprise-only:**
> - **Enterprise:** `POST /api/v3/enterprise/configure/token`
> - **Core: not supported** — `POST /api/v3/configure/token` returns **404** on Core 3.10.0, and the CLI has no `--permission` flag. Every Core token is an admin token (no RBAC). See `references/tokens.md` for the flavor callout.
> Admin-token endpoints are identical across both. Delete is identical.

### Create resource (scoped) token

**Enterprise** (verified live):

```
POST /api/v3/enterprise/configure/token
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "type": "resource",
  "token_name": "<name>",
  "expiry_secs": 3600,
  "permissions": [
    {
      "resource_type": "db",
      "resource_names": ["<dbname>"],
      "actions": ["read", "write"]
    }
  ]
}
```

`expiry_secs` is optional — omit for no expiry. The `permissions` array can have multiple entries; each entry combines `resource_type` (`"db"` or `"system"`), `resource_names` (array of strings; supports multiple names per permission), and `actions` (array of `"read"` and/or `"write"`).

**Response (201, verified):**

```json
{
  "id": 60,
  "name": "my_token",
  "token": "apiv3_<long-secret>",
  "hash": "<64-hex hash>",
  "created_at": "2026-05-08T02:37:49.675Z",
  "expiry": null
}
```

> **The plaintext secret value lives in the `token` field. It is shown ONCE and never retrievable again. Capture immediately and store in your secret manager.**

**Core: not supported.** Runtime-verified against Core 3.10.0 — `POST /api/v3/configure/token` returns **404** and the CLI rejects `--permission`. Core has no scoped/resource tokens or RBAC; every Core token is an admin token. (This corrects an earlier note that inferred a Core path from `influxdb3_ui` source; that path does not exist.)

### Create / regenerate admin token *(per influxdb3_ui source)*

```
POST /api/v3/configure/token/named_admin
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "type": "admin",
  "token_name": "<name>"
}
```

The first admin token is generated at server bootstrap (Core/Enterprise) — that's how you get the initial admin token in the first place. After that, this endpoint creates additional named admin tokens, or use it with `--regenerate` (CLI) to rotate the operator token.

### Delete token (verified live, works for resource and admin)

```
DELETE /api/v3/configure/token?token_name=<name>
Authorization: Bearer <admin-token>
```

**Response:** `200`, empty body. `404` if the token name does not exist.

### List tokens — use SQL on `system.tokens`

There is no purpose-built JSON-list HTTP endpoint for tokens. The CLI's `influxdb3 show tokens` and the InfluxDB Explorer UI both query `system.tokens` under the `_internal` database. To list via HTTP:

```
POST /api/v3/query_sql
Authorization: Bearer <admin-token>
Content-Type: application/json

{"db": "_internal", "q": "SELECT * FROM system.tokens"}
```

To filter by a specific token name, **bind the name as a parameter — never string-concatenate it into `q`.** Token names are user-chosen, so an interpolated name is a SQL-injection vector (`references/querying.md` → "Parameterize user input"):

```
{"db": "_internal",
 "q": "SELECT name FROM system.tokens WHERE name = $name",
 "params": {"name": "my-app-token"}}
```

**Schema of `system.tokens`** (verified live against Enterprise 3.8.4):

| Column | Type | Notes |
|---|---|---|
| `token_id` | int | Numeric ID |
| `name` | string | Human-readable name |
| `hash` | string | First 9 chars of the SHA-256 hash, useful for identification |
| `created_at` | string | ISO timestamp |
| `description` | string | Optional |
| `created_by_token_id` | int | The admin token that created this one |
| `updated_at` | string | Optional ISO timestamp |
| `updated_by_token_id` | int | Optional |
| `expiry` | string | Optional ISO timestamp |
| `permissions` | string (JSON) | A JSON-encoded array of short-form permission strings like `["db:gf_ha:read", "db:gf_ha:write"]`. **Caller must `JSON.parse` this string before iterating.** |

#### Short-form vs structured permissions

The same permission has two serializations:

- **Short form** (used by `system.tokens.permissions`, the CLI `--permission` flag, and the structured-form `actions` arrays expanded out): `"db:<name>:<action>"`.
- **Structured form** (used in the create-token HTTP body): `{"resource_type": "db", "resource_names": ["<name>"], "actions": ["read", "write"]}`.

The structured form's `resource_type` enum is `"db"` or `"system"`; `actions` enum is `"read"` or `"write"`. Multiple `resource_names` and multiple `actions` per object combine.

## Per-flavor differences

| Operation | Core | Enterprise | Cloud Serverless | Cloud Dedicated |
|---|---|---|---|---|
| Database CRUD | `/api/v3/configure/database` | Same | Product UI or management API | Product UI or management API |
| Resource token create | **Not supported** (404; no RBAC) | `/api/v3/enterprise/configure/token` | Product UI or management API | Product UI or management API |
| Admin token create | `/api/v3/configure/token/named_admin` | Same | Product UI or management API | Product UI or management API |
| Delete token | `/api/v3/configure/token?token_name=<name>` | Same | Product UI or management API | Product UI or management API |
| List tokens | SQL on `system.tokens` (`_internal`) | Same | (different — see the product docs) | (different — see the product docs) |

Request shapes for InfluxDB Cloud Serverless and InfluxDB Cloud Dedicated aren't live-verified. Route to that product's docs through `references/doc-urls.md`.

## Error codes

| Status | Meaning | Fix |
|---|---|---|
| 200 / 201 | Success | n/a |
| 400 | Bad request — invalid name, malformed body, invalid permission shape | Fix the input; the body usually names the field. Watch for using short-form permission strings in the create-token body — the body needs structured form. |
| 401 | Auth missing or invalid | Set `INFLUXDB_TOKEN` to a valid admin token. |
| 403 | Auth valid but lacks admin scope | Use the operator/admin token, not a scoped resource token. |
| 404 | Resource (DB or token name) not found, OR endpoint not found | Confirm the name. A 404 on `POST /api/v3/enterprise/configure/token` against **InfluxDB 3 Core** is expected — Core has no resource tokens; use InfluxDB 3 Enterprise or InfluxDB 3 Cloud for scoped tokens. |
| 409 | Already exists | Use a different name or delete first. |

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise HTTP API reference for the canonical endpoint list (which may evolve faster than this skill). For the source-of-truth on Core vs Enterprise endpoint divergence, the InfluxData Explorer (`influxdb3_ui`) `apps/backend/src/modules/influx-api/strategies/` directory.
