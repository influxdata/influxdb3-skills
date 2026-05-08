# Admin lifecycle — Go

`admin_lifecycle.go` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `net/http` to hit the management HTTP API directly. The official `influxdb3-go` client is data-plane only — admin operations go through the management API.

> **Targets Enterprise.** `createScopedToken` calls `/api/v3/enterprise/configure/token`. For Core, change to `/api/v3/configure/token`.

## What it does

The same 10-step lifecycle as `examples/admin-http/admin_lifecycle.sh`. Cleanup uses `defer`; partial failures still revoke whatever was created.

## Run it

```bash
go mod tidy
cp .env.example .env  # then edit
go run admin_lifecycle.go
```

## Adapting for production

- Don't copy into production CI without changing the test-DB name pattern.
- Generalize the `defer`-based cleanup into your real provisioning code.
- For Core, change `createScopedToken`'s endpoint.

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
