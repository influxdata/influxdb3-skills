# Admin lifecycle — Go

`admin_lifecycle.go` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `net/http` to hit the management HTTP API directly. The official `influxdb3-go` client is data-plane only — admin operations go through the management API.

> **Requires Enterprise or Cloud.** `createScopedToken` creates a scoped resource token via `/api/v3/enterprise/configure/token`. This does **not** run on Core — Core has no resource tokens (that path returns 404; the CLI has no `--permission`), so the scoped-token step fails there.

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
- Core can't run this example (no resource tokens); use it against Enterprise or Cloud.

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
