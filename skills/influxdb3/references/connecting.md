# Connecting & Authenticating to InfluxDB 3

## Configuration rules

Token rules are in `SKILL.md` §11.

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

## First-time setup checklist

When the developer is starting fresh in a project (no `.env`, no client imports), **the order matters**: the admin token has to exist before you can create a database, and the database has to exist before your application code can write to it. Don't conflate "create a token" with "create an application token" — they're different operations and they happen at different points.

### Bootstrapping (Core / Enterprise — self-hosted)

These steps happen ONCE, on the server side, before any application code:

1. **Pick the flavor** — Core or Enterprise (self-hosted). For InfluxDB 3 Cloud, see below. See `references/flavors.md`.
2. **Start the server** — `influxdb3 serve --object-store=...` (see `references/installing.md`).
3. **Create the operator/admin token.** For a brand-new server, this is a bootstrap step that does NOT require an existing token:
   - CLI: `influxdb3 create token --admin --host http://localhost:8181`
   - The token is shown once. Save it as `INFLUXDB_ADMIN_TOKEN` and use it for steps 4–5 (server admin), not as your application's token.
4. **Create the database** using the admin token:
   - CLI: `influxdb3 create database <name> --token "$INFLUXDB_ADMIN_TOKEN" --host http://localhost:8181`
   - Or HTTP: `POST /api/v3/configure/database` with `Authorization: Bearer $INFLUXDB_ADMIN_TOKEN` and body `{"db":"<name>"}`.
   - Full reference and HTTP API equivalents: `references/databases.md`.
5. **(Recommended)** Create a token for the application instead of reusing the operator token:
   - Enterprise: `influxdb3 create token --permission "db:<name>:read,write" --name <app> --token "$INFLUXDB_ADMIN_TOKEN"`
   - Core has admin tokens only: `influxdb3 create token --admin --name <app> --token "$INFLUXDB_ADMIN_TOKEN"` ([`references/tokens.md` → "InfluxDB 3 Core: admin tokens only"](tokens.md#influxdb-3-core-admin-tokens-only))
   - This is the token the application reads from `INFLUXDB_TOKEN`.
   - Full reference, including the safe rotation pattern: `references/tokens.md`.

### Bootstrapping (InfluxDB 3 Cloud)

InfluxData runs the server. Create the database and a database-scoped token as the InfluxDB 3 Cloud docs describe ([`references/doc-urls.md`](doc-urls.md)).

### Per-project setup (any flavor — happens in the developer's workspace)

Once the server side is bootstrapped and you have `host`, `database`, and `token` values to use:

4. **Verify `.gitignore` excludes `.env`** — `grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore`. See rule 3.
5. **Create `.env.example`** with the canonical keys you need and stub values. Commit it.
6. **Create `.env`** by copying `.env.example` and filling in the real values. Confirm `git status` does NOT show `.env`.
7. **Pick the client library** — see the language router; generate the hello-world; run it.

### When the developer says "I just spun up Core/Enterprise"

That means they're at step 2 of bootstrapping, with nothing else done yet. Walk through 3 → 4 → 5 before any application code. If they choose to skip step 5 and use the admin token, state the risk and continue. Don't assume a database already exists.

## `.env` loaders per language

| Language | Library | Snippet |
|---|---|---|
| Python | `python-dotenv` | `from dotenv import load_dotenv; load_dotenv()` at the top of the entry point |
| JavaScript / TypeScript | `dotenv` | `import 'dotenv/config'` (ESM) or `require('dotenv').config()` (CJS) |
| Go | `github.com/joho/godotenv` | `_ = godotenv.Load()` at the top of `main()` |
| Java | `io.github.cdimascio:dotenv-java` | `Dotenv dotenv = Dotenv.load();` then `dotenv.get("INFLUXDB_TOKEN")` |
| C# | `DotNetEnv` | `DotNetEnv.Env.Load();` at startup, then `Environment.GetEnvironmentVariable(...)` |

## The silent auto-create footgun

> **Important:** InfluxDB 3 Core and Enterprise (with default config) will **silently auto-create a database on first write**. For other products, check their docs. A typo in `INFLUXDB_DATABASE` won't error — it'll create a brand-new, empty database with the misspelled name and write your data there. The original database receives nothing; your dashboards and queries against the original name return zero rows.

This means: **a script can report `==> Done` while doing the wrong thing.** Always verify the database exists *before* writing.

### Verify a database exists

CLI:

```bash
influxdb3 show databases --host "$INFLUXDB_HOST" --token "$INFLUXDB_ADMIN_TOKEN"
```

HTTP:

```bash
curl -sS "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  -H "Authorization: Bearer $INFLUXDB_ADMIN_TOKEN" | jq -r '.[] | ."iox::database"'
```

If the target name isn't in the list, **create it before writing**:

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Authorization: Bearer $INFLUXDB_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\"}"
```

If a typo has already auto-created a wrong-named DB, see [`references/databases.md` → "Recovering from the silent auto-create footgun"](databases.md#recovering-from-the-silent-auto-create-footgun) for the recovery flow.

For symptom-by-symptom diagnostic + recovery flow, see [`references/troubleshooting.md` → "Silent auto-create misroute"](troubleshooting.md#silent-auto-create-misroute).

### When generating new application code

If the developer is starting fresh and you don't have evidence the database already exists, **either create the database explicitly** as part of the setup walkthrough, **or include a startup check** in the generated code that lists databases and aborts with a clear error if the target isn't there. Don't ship code that silently creates a database the developer didn't intend.

## When the developer pushes back on env vars

If they want a config file or hard-coded constants for "just a quick test":

- Suggest exporting `INFLUXDB_TOKEN=...` in their shell for the duration of the test.
- If they want a `.env`, follow rule 3.
