# Admin lifecycle — JavaScript / Node

`admin-lifecycle.js` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using built-in `fetch` (Node 18+) to hit the management HTTP API directly. The official `@influxdata/influxdb3-client` is data-plane only — it doesn't expose admin operations.

> **Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud.** `createScopedToken` creates a scoped resource token via `/api/v3/enterprise/configure/token`. Core has no resource tokens, so it doesn't run on Core (`references/tokens.md`).

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

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
