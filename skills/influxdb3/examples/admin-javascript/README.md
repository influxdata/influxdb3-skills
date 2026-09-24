# Admin lifecycle — JavaScript / Node

`admin-lifecycle.js` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using built-in `fetch` (Node 18+) to hit the management HTTP API directly. The official `@influxdata/influxdb3-client` is data-plane only — it doesn't expose admin operations.

> **Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud.** `createScopedToken` creates a scoped resource token via `/api/v3/enterprise/configure/token`. This does **not** run on Core — Core has no resource tokens (that path returns 404; the CLI has no `--permission`), so the scoped-token step fails there.

## What it does

The same 10-step lifecycle as `examples/admin-http/admin_lifecycle.sh`. Cleanup runs in a `try/finally`; partial failures still revoke whatever was created.

## Run it

```bash
npm install
cp .env.example .env  # then edit
node admin-lifecycle.js
```

> The token created at step 3 is real. Its plaintext value is held only in a local variable and used immediately; never logged or persisted.

## Adapting for production

- Don't copy into production CI without changing the test-DB name pattern.
- Generalize the `try/finally` cleanup pattern into your real provisioning code.
- Core can't run this example (no resource tokens); use it against InfluxDB 3 Enterprise or InfluxDB 3 Cloud.

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
