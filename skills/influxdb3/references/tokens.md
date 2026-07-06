# Token Management

## Three kinds of tokens

| Token type | When created | Used for | Stored where |
|---|---|---|---|
| **Operator/admin token** | At server bootstrap (Core/Enterprise) or, for other products, as that product's docs describe | Admin operations: creating databases, creating other tokens, regenerating itself | Server bootstrap output (printed once) or the product's UI |
| **Scoped resource token** | Created via `--permission` referencing a specific database | Application code: writing data, querying | The application's `INFLUXDB_TOKEN` env var, or its secret manager |
| **Bootstrap operator token** *(self-hosted only)* | Auto-generated at first server start | One-time: create your "real" admin token, then revoke this | Save once, then discard |

**The most important rule:** application code reads a **scoped resource token**, never the admin token. The admin token is for admin operations only.

## CLI

### Create or regenerate the admin token

```bash
# Create a new named admin token
influxdb3 create token --admin --name <name> --token "$INFLUXDB_TOKEN"

# Regenerate the operator token (rotate the bootstrap admin).
# The old operator token stops working immediately (401).
influxdb3 create token --admin --regenerate --token "$INFLUXDB_TOKEN"

# With expiry
influxdb3 create token --admin --name <name> --expiry 90d --token "$INFLUXDB_TOKEN"
```

The new token's secret value is printed to stdout **once** when created — capture it immediately. The server stores only a hash; if you lose the plaintext, you must create a new token.

> **Scripting token capture? Use `--format json`** — the default text output contains ANSI color codes that corrupt a grepped token. Parse the `token` field instead:
> ```bash
> TOKEN=$(influxdb3 create token --admin --format json | jq -r .token)
> ```

### Create a scoped resource token

`--name` and `--permission` are required. Permission format: `$RESOURCE_TYPE:$RESOURCE_NAMES:$ACTIONS`.

```bash
influxdb3 create token \
  --permission "db:<dbname>:read,write" \
  --name <token-name> \
  --token "$INFLUXDB_TOKEN"

# Multiple permissions
influxdb3 create token \
  --permission "db:db1:read,write" \
  --permission "db:db2:read" \
  --name <token-name> \
  --token "$INFLUXDB_TOKEN"

# With expiry
influxdb3 create token \
  --permission "db:<dbname>:read,write" \
  --name <token-name> \
  --expiry 30d \
  --token "$INFLUXDB_TOKEN"
```

Resource type: `db` or `system`. Action: `read` or `write`. `*` is allowed for `RESOURCE_NAMES` (e.g., `db:*:read,write` to grant cross-database access — use sparingly).

### List tokens

```bash
influxdb3 show tokens --token "$INFLUXDB_TOKEN"
influxdb3 show tokens --format json --token "$INFLUXDB_TOKEN"
```

The CLI internally queries `system.tokens` under `_internal`. Equivalent SQL:

```sql
SELECT * FROM system.tokens;
```

> **Filtering by name? Bind it, don't interpolate.** Token names are user-chosen, so `WHERE name = '<name>'` built by string-concatenation is a SQL-injection vector. Pass the name as a bound parameter (`WHERE name = $name` with a `params`/`query_parameters` object) — see `references/querying.md` → "Parameterize user input" and the `examples/admin-*/` lifecycle scripts.

> **`permissions` column is a JSON-encoded string** like `["db:gf_ha:read", "db:gf_ha:write"]`. To filter by permission programmatically, `JSON.parse` the column value first.

### Delete a token

```bash
influxdb3 delete token --token-name <name> --token "$INFLUXDB_TOKEN"
```

> The flag is `--token-name` (not positional, no `--force`). Don't confuse with `--token`, which is the admin token used to authenticate the request.

## Permission-string syntax

Format: `<resource_type>:<resource_names>:<actions>` where:

- `<resource_type>` is `db` or `system`
- `<resource_names>` is a comma-separated list of names, or `*` for all
- `<actions>` is `read`, `write`, or `read,write`

Examples:

```
db:sensors:read,write       Full access to one DB
db:sensors:read             Read-only access to one DB
db:sensors,metrics:read     Read-only across two DBs
db:*:read                   Read-only across ALL DBs (use sparingly)
system:*:read               Read system tables (e.g., system.tokens, system.queries)
```

For HTTP-API token creation, the equivalent **structured form** is:

```json
{
  "resource_type": "db",
  "resource_names": ["sensors"],
  "actions": ["read", "write"]
}
```

The CLI's short-form string and the HTTP body's structured object encode the same permission. The `system.tokens` table stores a JSON-string of short-form strings.

## HTTP API

See `references/admin-http-api.md` for full request/response shapes including the Core-vs-Enterprise endpoint divergence:

- **Core resource token create:** `POST /api/v3/configure/token`
- **Enterprise resource token create:** `POST /api/v3/enterprise/configure/token`
- Admin token create (both): `POST /api/v3/configure/token/named_admin`
- Delete token (both): `DELETE /api/v3/configure/token?token_name=<name>`
- List tokens: SQL on `system.tokens`

## Token rotation pattern

The safe order is:

1. **Create the new token** with the same permissions as the old one.
2. **Write the new token to your secret store / env** (Vault, AWS Secrets Manager, `.env`, etc.).
3. **Restart consumers** (or do a rolling restart) so they pick up the new token.
4. **Revoke the old token** only after every consumer has confirmed it's running on the new one.

Reverse this order at your peril:
- Delete-then-create: every consumer fails between the two steps (downtime).
- Create-then-delete-without-swap: you've leaked tokens (the old one is still valid for whoever sees it).
- Swap-without-restart: long-running connections may keep using the old token until they reconnect.

## Token sources by product

| Flavor | Admin token source | Scoped token creation |
|---|---|---|
| Core | First server start prints it; or `influxdb3 create token --admin` | CLI or HTTP as above |
| Enterprise | Same as Core | Same as Core |
| InfluxDB Cloud Serverless | InfluxDB Cloud Serverless UI → Tokens | InfluxDB Cloud Serverless UI → Tokens, or management API |
| InfluxDB Cloud Dedicated | InfluxDB Cloud Dedicated console → Tokens | InfluxDB Cloud Dedicated console, or management API |

For InfluxDB 3 Cloud and InfluxDB Clustered, see their docs. Request shapes for these products aren't live-verified. Route to that product's docs through `references/doc-urls.md`.

## Adversarial scenarios — what NOT to do

| Anti-pattern | Why | Do this instead |
|---|---|---|
| Inline the admin token in a CI script | Anyone with read access to the repo or CI logs has full control of your InfluxDB instance | Read from `INFLUXDB_TOKEN` env or secret manager |
| Use the admin token at the data plane (writes, queries) | One leak = total compromise; admin scope is far broader than the app needs | Create a scoped resource token; use that |
| Store the token in a Python `Cache` from a Processing Engine plugin | The `Cache` is in-memory and gets restarted; tokens in plugin code are visible to anyone with read on the plugin file | Pass tokens via `args` (CLI `--trigger-arguments`) or by reading env on the server |
| Per-end-user tokens in a multi-tenant SaaS | InfluxDB tokens are per-application, not per-user — creating thousands of tokens explodes operationally | Authenticate the end user in your app, then proxy the InfluxDB call with one app-scoped token |

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise reference for the token CLI commands.
