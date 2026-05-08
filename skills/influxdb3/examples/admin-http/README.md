# Admin lifecycle — HTTP / curl

`admin_lifecycle.sh` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise** via the HTTP API. Reads `INFLUXDB_HOST` and `INFLUXDB_TOKEN` (admin) from env or `.env`.

> **Targets Enterprise.** The script uses `/api/v3/enterprise/configure/token` for resource-token creation. For Core, change that endpoint to `/api/v3/configure/token` — everything else (database CRUD, delete-token, list-tokens-via-SQL) is identical.

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

A `trap EXIT` ensures cleanup runs even on partial failure. Mid-script crashes still revoke whatever was created. The trap uses the admin token from env to delete any token or database the script created.

## Run it

```bash
cp .env.example .env  # then edit with real values
./admin_lifecycle.sh
```

> **The token created at step 3 is real.** Its plaintext value is captured in a shell variable and used immediately to write a point — never logged, never persisted to disk. If you Ctrl+C the script, the trap still revokes the token.

## Adapting for production

- **Do not** copy this script into a production CI workflow without changing the test-DB name pattern. The `admin_test_http_<ts>` pattern is for development only.
- **Do** generalize the trap-based cleanup pattern into your real provisioning scripts.
- **For Core**, change `/api/v3/enterprise/configure/token` to `/api/v3/configure/token`.

## Where to fetch more

`references/admin-http-api.md` for the full endpoint table and per-flavor map; `references/tokens.md` for the rotation pattern and permission-string syntax.
