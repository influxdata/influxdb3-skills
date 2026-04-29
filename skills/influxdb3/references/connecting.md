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
| `INFLUXDB_DATABASE` | yes | The database (Core/Enterprise) or bucket (Cloud) name |
| `INFLUXDB_ORG` | no | Only needed for v2-style endpoints (Cloud Serverless write path); leave unset elsewhere |

## First-time setup checklist (six steps)

When the developer is starting fresh in a project (no `.env`, no client imports):

1. **Pick the flavor** — Core, Enterprise, Cloud Serverless, or Cloud Dedicated. If the developer doesn't know, ask. See `references/flavors.md`.
2. **Create a token** — instructions vary per flavor; link the developer to the relevant page on `docs.influxdata.com` from `references/doc-urls.md`.
3. **Verify `.gitignore` excludes `.env`** — `grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore`.
4. **Create `.env.example`** with the four canonical keys above and stub values.
5. **Create `.env`** by copying `.env.example` and filling in the real values. Confirm `git status` does NOT show `.env`.
6. **Pick the client library** — see the language router below; generate the hello-world; run it.

## `.env` loaders per language

| Language | Library | Snippet |
|---|---|---|
| Python | `python-dotenv` | `from dotenv import load_dotenv; load_dotenv()` at the top of the entry point |
| JavaScript / TypeScript | `dotenv` | `import 'dotenv/config'` (ESM) or `require('dotenv').config()` (CJS) |
| Go | `github.com/joho/godotenv` | `_ = godotenv.Load()` at the top of `main()` |
| Java | `io.github.cdimascio:dotenv-java` | `Dotenv dotenv = Dotenv.load();` then `dotenv.get("INFLUXDB_TOKEN")` |
| C# | `DotNetEnv` | `DotNetEnv.Env.Load();` at startup, then `Environment.GetEnvironmentVariable(...)` |

## When the developer pushes back on env vars

If they want a config file or hard-coded constants for "just a quick test":

- Refuse to inline the token. Suggest exporting `INFLUXDB_TOKEN=...` in their shell for the duration of the test.
- If they insist, write a `.env` and confirm `.gitignore` excludes it before generating any other code.
