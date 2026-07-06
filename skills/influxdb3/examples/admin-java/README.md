# Admin lifecycle — Java

`AdminLifecycle.java` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `java.net.http.HttpClient` and `org.json` to hit the management HTTP API directly. Plus `dotenv-java` for `.env` loading.

> **Requires Enterprise or Cloud.** `createScopedToken` creates a scoped resource token via `/api/v3/enterprise/configure/token`. This does **not** run on Core — Core has no resource tokens (that path returns 404; the CLI has no `--permission`), so the scoped-token step fails there.

## What it does

The same 10-step lifecycle as the other admin examples. Cleanup uses `try/finally` with a `state` map.

## Run it

```bash
mvn -q compile
cp .env.example .env  # then edit
mvn -q exec:java -Dexec.mainClass="AdminLifecycle"
```

Requires JDK 17+ and Maven.

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
