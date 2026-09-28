# Admin lifecycle — C#

`AdminLifecycle.cs` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `System.Net.Http.HttpClient` and `System.Text.Json` to hit the management HTTP API directly. Plus `DotNetEnv` for .env loading.

> **Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud.** `CreateScopedTokenAsync` creates a scoped resource token via `/api/v3/enterprise/configure/token`. Core has no resource tokens, so it doesn't run on Core (`references/tokens.md`).

## What it does

The same 10-step lifecycle as the other admin examples. Cleanup uses `try/finally` with a state dictionary.

## Run it

```bash
dotnet restore
cp .env.example .env  # then edit
dotnet run
```

Requires .NET 8.0+.

## Where to fetch more

`references/admin-http-api.md`, `references/tokens.md`.
