# Admin lifecycle — C#

`AdminLifecycle.cs` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `System.Net.Http.HttpClient` and `System.Text.Json` to hit the management HTTP API directly. Plus `DotNetEnv` for .env loading.

> **Targets Enterprise.** `CreateScopedTokenAsync` calls `/api/v3/enterprise/configure/token`. For Core, change to `/api/v3/configure/token`.

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
