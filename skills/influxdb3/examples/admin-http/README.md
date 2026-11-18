# Admin lifecycle — HTTP / curl

`admin_lifecycle.sh` exercises the full token + database lifecycle via the HTTP API. Reads `INFLUXDB_HOST` and `INFLUXDB_ADMIN_TOKEN` from env or `.env`.

> **Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud.** The script creates scoped resource tokens via `/api/v3/enterprise/configure/token`. Core has no resource tokens, so it doesn't run on Core ([`references/tokens.md`](../../references/tokens.md)). Everything else (database CRUD, delete-token, list-tokens-via-SQL) is the same on Core and Enterprise.

## What it does

1. List databases (sanity check)
2. Create `admin_test_http_<unix_ts>`
3. Create scoped read+write token for the DB (Enterprise endpoint)
4. Write a sample point using that scoped token (proves it works)
5. List tokens via SQL (`SELECT name FROM system.tokens WHERE name = ...`), confirm presence
6. Rotate: create a second scoped token
7. Verify the new token works; delete the first
8. Delete the database
9. Delete the rotated token
10. Final orphan check via SQL — fails if any `admin_test_http_*` database or token survives

## Cleanup is trapped

Every example that creates tokens or databases registers cleanup before it creates anything: a `trap EXIT` here, `try/finally` in the Python examples. A partial failure or Ctrl+C still deletes every token and database the script created, using the admin token from env. Use the same pattern in real provisioning scripts.

## Run it

```bash
cp .env.example .env  # then edit with real values
./admin_lifecycle.sh
```

> **The token created at step 3 is real.** Its plaintext value is captured in a shell variable and used immediately to write a point — never logged, never persisted to disk. If you Ctrl+C the script, the trap still revokes the token.

## Adapting for production

- **Do not** copy this script into a production CI workflow without changing the test-DB name pattern. The `admin_test_http_<ts>` pattern is for development only.

## Where to fetch more

[`references/admin-http-api.md`](../../references/admin-http-api.md) for the full endpoint table and per-flavor map; [`references/tokens.md`](../../references/tokens.md) for the rotation pattern and permission-string syntax.
