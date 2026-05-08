# Database Management

## What this covers

Provisioning and managing InfluxDB 3 databases via CLI and HTTP API. For application code that *uses* a database (writing data, querying), see the v0.1.0 connecting/writing/querying references.

> All operations here require an **admin token**. Use a scoped resource token for application code; use the admin token only for these admin operations. See `references/tokens.md`.

## Lifecycle

A database goes through: **create → use → (optionally) update retention → delete**. Names follow the same conventions as measurement names: snake_case, no SQL reserved words, no spaces.

## CLI

### Create

```bash
influxdb3 create database <name> --token "$INFLUXDB_TOKEN"

# With retention period (human-readable duration: "30d", "24h", "1y")
influxdb3 create database <name> --retention-period 30d --token "$INFLUXDB_TOKEN"
```

> The CLI also reads `INFLUXDB3_AUTH_TOKEN` from env. Examples in this skill use `--token "$INFLUXDB_TOKEN"` explicitly so the same `INFLUXDB_TOKEN` env var works for both CLI and application code without renaming.

### List

```bash
influxdb3 show databases --token "$INFLUXDB_TOKEN"
influxdb3 show databases --format json --token "$INFLUXDB_TOKEN"

# Include soft-deleted databases
influxdb3 show databases --show-deleted --token "$INFLUXDB_TOKEN"
```

### Update retention

```bash
# Set retention
influxdb3 update database -d <name> -r 7d --token "$INFLUXDB_TOKEN"

# Clear retention (keep data forever)
influxdb3 update database -d <name> -r none --token "$INFLUXDB_TOKEN"
```

> `update database` uses `-d/--database <name>` (a flag), not a positional argument.

### Delete

```bash
influxdb3 delete database <name> --token "$INFLUXDB_TOKEN"
```

The CLI's `delete database` is **non-interactive by default** — there is no `--force` flag. Advanced options:

```bash
# Soft-delete: keep data and resources, mark for hard-delete later
influxdb3 delete database <name> --hard-delete never --token "$INFLUXDB_TOKEN"

# Hard-delete now (default)
influxdb3 delete database <name> --hard-delete now --token "$INFLUXDB_TOKEN"

# Delete only data (keep tokens, triggers, caches, schema)
influxdb3 delete database <name> --data-only --token "$INFLUXDB_TOKEN"

# Delete data + tables, keep DB-level resources (tokens, triggers)
influxdb3 delete database <name> --data-only --remove-tables --token "$INFLUXDB_TOKEN"
```

## HTTP API

See `references/admin-http-api.md` for the full endpoint reference. Quick summary:

| Verb | Method + path |
|---|---|
| List | `GET /api/v3/configure/database?format=json` |
| Create | `POST /api/v3/configure/database` body `{"db": "<name>"}` |
| Delete | `DELETE /api/v3/configure/database?db=<name>` |

Database CRUD is **identical across Core and Enterprise** (verified against Enterprise 3.8.4; Core uses the same paths per source).

## Per-flavor differences

| Flavor | Database creation |
|---|---|
| Core, Enterprise (self-hosted) | CLI or HTTP API as above |
| Cloud Serverless | Cloud console; or management API (different endpoint — see `doc-urls.md`) |
| Cloud Dedicated | Cloud console; or management API |

## Recovering from the silent auto-create footgun

InfluxDB 3 silently auto-creates a database on first write to a name that doesn't exist. If you've written to a typo'd database name (e.g., `senor_data` instead of `sensor_data`):

1. Verify which DB has the data:
   ```bash
   influxdb3 query -d <typo_name> --token "$INFLUXDB_TOKEN" "SELECT count(*) FROM <table>"
   influxdb3 query -d <correct_name> --token "$INFLUXDB_TOKEN" "SELECT count(*) FROM <table>"
   ```
2. Fix the env var or the typo in code so future writes target the correct name.
3. Once you've confirmed writes are now flowing to the correct DB, drop the typo'd one:
   ```bash
   influxdb3 delete database <typo_name> --token "$INFLUXDB_TOKEN"
   ```

For prevention guidance, see v0.1.0's setup checklist in `SKILL.md` §2 and `references/connecting.md` → "The silent auto-create footgun".

## Reserved or problematic names

- `_internal` — system database; do not use as your application's DB name. Reading from it (e.g., `system.tokens`, `system.processing_engine_logs`) is fine.
- Names containing `..`, `/`, or starting with `_` — rejected or reserved.
- SQL reserved words (`time`, `value`, `select`, `database`, etc.) work as DB names but make queries awkward; avoid.

## Where to fetch more

`references/doc-urls.md` → InfluxDB 3 Enterprise reference for the database CLI command page.
