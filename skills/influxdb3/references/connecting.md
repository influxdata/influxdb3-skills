# Connecting & Authenticating to InfluxDB 3

## Configuration rules

1. **Read settings from env vars in production code.** `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, and `INFLUXDB_DATABASE` are the canonical names. Reuse them across languages so a developer can switch languages without reconfiguring.
2. **Use `.env` for local development.** `.env` is loaded by a language-specific dotenv library at startup. **Never commit `.env`.**
3. **Add `.env` to `.gitignore` first.** Before generating any code that creates or reads a `.env` file, check that `.gitignore` exists and contains `.env`, and add the entry if it doesn't. If the developer wants to skip or defer this, warn that one commit of `.env` publishes the token, then follow their choice.
4. **Ship `.env.example` instead.** A committed file with the required keys and stub values, so a new developer cloning the repo knows what to set.

## Canonical env vars

| Variable | Required | Notes |
|---|---|---|
| `INFLUXDB_HOST` | yes | Full URL including scheme and port, for example `http://localhost:8181` |
| `INFLUXDB_TOKEN` | yes | Database-scoped token, or a named admin token on Core |
| `INFLUXDB_DATABASE` | yes | The database name |

## Setup commands

On Core and Enterprise:

1. Start the server: `influxdb3 serve --object-store=...` ([`references/installing.md`](installing.md)).
2. Create the operator token. On a new server this needs no existing token:
   `influxdb3 create token --admin --host http://localhost:8181`.
   The token is shown once. Save it as `INFLUXDB_ADMIN_TOKEN`.
3. Create the database:
   - CLI: `influxdb3 create database <name> --token "$INFLUXDB_ADMIN_TOKEN" --host http://localhost:8181`
   - HTTP: `POST /api/v3/configure/database` with `Authorization: Bearer $INFLUXDB_ADMIN_TOKEN` and body `{"db":"<name>"}`
   - More: [`references/databases.md`](databases.md).
4. Create the application token, which the application reads from `INFLUXDB_TOKEN`:
   - Enterprise: `influxdb3 create token --permission "db:<name>:read,write" --name <app> --token "$INFLUXDB_ADMIN_TOKEN"`
   - Core, which has admin tokens only: `influxdb3 create token --admin --name <app> --token "$INFLUXDB_ADMIN_TOKEN"` ([`references/tokens.md` → "InfluxDB 3 Core: admin tokens only"](tokens.md#influxdb-3-core-admin-tokens-only))
   - Rotation: [`references/tokens.md`](tokens.md).

On InfluxDB 3 Cloud, create the database and a database-scoped token as its docs describe ([`references/doc-urls.md`](doc-urls.md)).

In the developer's workspace:

1. `grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore` (rule 3).
2. Create `.env.example` with the canonical keys and stub values, and commit it.
3. Copy it to `.env`, fill in the real values, and confirm `git status` doesn't list `.env`.

## `.env` loaders per language

| Language | Library | Snippet |
|---|---|---|
| Python | `python-dotenv` | `from dotenv import load_dotenv; load_dotenv()` at the top of the entry point |
| JavaScript / TypeScript | `dotenv` | `import 'dotenv/config'` (ESM) or `require('dotenv').config()` (CJS) |
| Go | `github.com/joho/godotenv` | `_ = godotenv.Load()` at the top of `main()` |
| Java | `io.github.cdimascio:dotenv-java` | `Dotenv dotenv = Dotenv.load();` then `dotenv.get("INFLUXDB_TOKEN")` |
| C# | `DotNetEnv` | `DotNetEnv.Env.Load();` at startup, then `Environment.GetEnvironmentVariable(...)` |

## Check that the database exists

CLI:

```bash
influxdb3 show databases --host "$INFLUXDB_HOST" --token "$INFLUXDB_ADMIN_TOKEN"
```

HTTP:

```bash
curl -sS "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  -H "Authorization: Bearer $INFLUXDB_ADMIN_TOKEN" | jq -r '.[] | ."iox::database"'
```

If the target name isn't in the list, create it before writing:

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Authorization: Bearer $INFLUXDB_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\"}"
```

Generated application code runs the same check at startup and exits with a clear error when the database is missing.
If data already went to a misspelled database, see [`references/troubleshooting.md` → "Silent auto-create misroute"](troubleshooting.md#silent-auto-create-misroute).

## When the developer pushes back on env vars

If they want a config file or hard-coded constants for "just a quick test":

- Suggest exporting `INFLUXDB_TOKEN=...` in their shell for the duration of the test.
- If they want a `.env`, follow rule 3.
