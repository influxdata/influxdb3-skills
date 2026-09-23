# Connecting & Authenticating to InfluxDB 3

## The Five Rules

1. **Never inline a token.** Tokens live in env vars or `.env` files. Generated code reads them from `os.environ` / `process.env` / etc. — it never has a literal token string.
2. **Always use env vars in production code.** `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` are the canonical names; reuse them across languages so a developer can switch languages without re-configuring.
3. **Use `.env` for local development.** `.env` is loaded by a language-specific dotenv library at startup. **Never commit `.env`.**
4. **Add `.env` to `.gitignore` first.** Before generating any code that creates or reads a `.env` file, verify that `.gitignore` exists and contains `.env`. If it doesn't, add the entry. This is non-negotiable.
5. **Ship `.env.example` instead.** A committed file with the required keys and stub values, so a new developer cloning the repo knows what to set.

## Canonical env vars

| Variable | Required | Notes |
|---|---|---|
| `INFLUXDB_HOST` | yes | Full URL including scheme and port; e.g., `http://localhost:8181` for Core or `https://us-east-1-1.cloud2.influxdata.com` for Cloud Serverless |
| `INFLUXDB_TOKEN` | yes | Database-scoped or admin token; never inline |
| `INFLUXDB_DATABASE` | yes | The database (Core/Enterprise) or bucket (InfluxDB Cloud Serverless) name |
| `INFLUXDB_ORG` | no | Only needed for v2-style endpoints (Cloud Serverless write path); leave unset elsewhere |

## First-time setup checklist

When the developer is starting fresh in a project (no `.env`, no client imports), **the order matters**: the admin token has to exist before you can create a database, and the database has to exist before your application code can write to it. Don't conflate "create a token" with "create an application token" — they're different operations and they happen at different points.

### Bootstrapping (Core / Enterprise — self-hosted)

These steps happen ONCE, on the server side, before any application code:

1. **Pick the flavor** — Core or Enterprise (self-hosted), or skip to InfluxDB Cloud Serverless / InfluxDB Cloud Dedicated below. For InfluxDB 3 Cloud and InfluxDB Clustered, follow their docs. See `references/flavors.md`.
2. **Start the server** — `influxdb3 serve --object-store=...` (Core) or your cluster bootstrap (Enterprise).
3. **Create the operator/admin token.** For a brand-new server, this is a bootstrap step that does NOT require an existing token:
   - CLI: `influxdb3 create token --admin --host http://localhost:8181`
   - Save the token output — it's shown ONCE. Use it for steps 4–5 (server admin), not as your application's token.
4. **Create the database** using the admin token:
   - CLI: `influxdb3 create database <name> --token <admin-token> --host http://localhost:8181`
   - Or HTTP: `POST /api/v3/configure/database` with `Authorization: Bearer <admin-token>` and body `{"db":"<name>"}`.
   - Full reference and HTTP API equivalents: `references/databases.md`.
5. **(Recommended)** Create a database-scoped token for the application instead of reusing the admin token:
   - CLI: `influxdb3 create token --permission "db:<name>:read,write" --token <admin-token>`
   - This is the token the application reads from `INFLUXDB_TOKEN`.
   - Full reference, including the safe rotation pattern: `references/tokens.md`.

### Bootstrapping (Cloud Serverless / Cloud Dedicated)

The server already exists and the bootstrap admin already happened on InfluxData's side:

1. **Pick the flavor** and confirm the host pattern (`<region>-<id>.cloud2.influxdata.com` for Serverless; customer-specific hostname for Dedicated). See `references/flavors.md`.
2. **Create the database/bucket** in the product's UI or management API (instructions vary per flavor — see `references/doc-urls.md`).
3. **Create a database-scoped token** in the product's UI or management API.

### Per-project setup (any flavor — happens in the developer's workspace)

Once the server side is bootstrapped and you have `host`, `database`, and `token` values to use:

4. **Verify `.gitignore` excludes `.env`** — `grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore`. Non-negotiable.
5. **Create `.env.example`** with the four canonical keys above and stub values. Commit it.
6. **Create `.env`** by copying `.env.example` and filling in the real values. Confirm `git status` does NOT show `.env`.
7. **Pick the client library** — see the language router; generate the hello-world; run it.

### When the developer says "I just spun up Core/Enterprise"

That means they're at step 2 of bootstrapping, with nothing else done yet. Walk through 3 → 4 → 5 (or 4 if they're fine reusing the admin token for now) before any application code. Don't assume a database already exists.

## `.env` loaders per language

| Language | Library | Snippet |
|---|---|---|
| Python | `python-dotenv` | `from dotenv import load_dotenv; load_dotenv()` at the top of the entry point |
| JavaScript / TypeScript | `dotenv` | `import 'dotenv/config'` (ESM) or `require('dotenv').config()` (CJS) |
| Go | `github.com/joho/godotenv` | `_ = godotenv.Load()` at the top of `main()` |
| Java | `io.github.cdimascio:dotenv-java` | `Dotenv dotenv = Dotenv.load();` then `dotenv.get("INFLUXDB_TOKEN")` |
| C# | `DotNetEnv` | `DotNetEnv.Env.Load();` at startup, then `Environment.GetEnvironmentVariable(...)` |

## The silent auto-create footgun

> **Important:** InfluxDB 3 Core and Enterprise (with default config) will **silently auto-create a database on first write**. For other products, check their docs. A typo in `INFLUXDB_DATABASE` won't error — it'll create a brand-new, empty database with the misspelled name and write your data there. The original database keeps growing nothing; your dashboards and queries against the original name return zero rows.

This means: **a script can report `==> Done` while doing the wrong thing.** Always verify the database exists *before* writing.

### Verify a database exists

CLI:

```bash
influxdb3 show databases --host "$INFLUXDB_HOST" --token "$INFLUXDB_TOKEN"
```

HTTP:

```bash
curl -sS "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" | jq -r '.[] | ."iox::database"'
```

If the target name isn't in the list, **create it before writing**:

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\"}"
```

If a typo has already auto-created a wrong-named DB, see `references/databases.md` → "Recovering from the silent auto-create footgun" for the recovery flow.

For symptom-by-symptom diagnostic + recovery flow, see `references/troubleshooting.md` → "Silent auto-create misroute".

### When generating new application code

If the developer is starting fresh and you don't have evidence the database already exists, **either create the database explicitly** as part of the setup walkthrough, **or include a startup check** in the generated code that lists databases and aborts with a clear error if the target isn't there. Don't ship code that silently creates a database the developer didn't intend.

## When the developer pushes back on env vars

If they want a config file or hard-coded constants for "just a quick test":

- Refuse to inline the token. Suggest exporting `INFLUXDB_TOKEN=...` in their shell for the duration of the test.
- If they insist, write a `.env` and confirm `.gitignore` excludes it before generating any other code.
