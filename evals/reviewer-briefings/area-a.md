# Reviewer Briefing — Area A: Connect / Write / Query / Schema

This is the largest review area. You're testing whether Claude generates correct first-time application code: connecting to InfluxDB 3, writing line protocol, querying with v3 SQL, and giving sensible schema-design advice — across all four flavors and all six client paths.

---

## What you're reviewing

### In `skills/influxdb3/SKILL.md`

- §1.5 — Don't have an instance yet?
- §2 — First-time setup checklist (the hard gate — silent auto-create footgun)
- §3 — Flavor detection
- §4 — Connecting & authenticating
- §5 — Writing data
- §6 — Querying data
- §7 — Schema design
- §8 — When in doubt, fetch fresh docs

### Reference files

- `skills/influxdb3/references/connecting.md`
- `skills/influxdb3/references/writing.md`
- `skills/influxdb3/references/querying.md`
- `skills/influxdb3/references/schema-design.md`
- `skills/influxdb3/references/flavors.md`
- `skills/influxdb3/references/flavor-detection.md`
- `skills/influxdb3/references/installing.md` (install scenarios — smoke prompts #28–#29)
- `skills/influxdb3/references/clients/` (python, javascript, go, java, csharp, http)

### Example directories

- `skills/influxdb3/examples/python/`
- `skills/influxdb3/examples/javascript/`
- `skills/influxdb3/examples/go/`
- `skills/influxdb3/examples/java/`
- `skills/influxdb3/examples/csharp/`
- `skills/influxdb3/examples/http/`

---

## Smoke prompts assigned to you

From `evals/smoke-prompts.md`. Run each in a fresh Claude Code session in a clean throwaway directory.

| # | Topic |
|---|---|
| 1 | Connect + write, Python, Core |
| 2 | Query, Python, SQL |
| 3 | Cross-language portability (Go) |
| 4 | Flavor switch — Cloud Serverless, JavaScript |
| 5 | Schema design — GPU fleet, cardinality |
| 6 | Batch write, C# |
| 7 | SQL aggregation query |
| 8 | Parameterized query, Java |
| 9 | Raw HTTP / curl, Cloud Dedicated |
| 12 | Flavor detection from code |
| 28 | Install path: Core (just-installed-plugin scenario) |
| 29 | Install path: Enterprise |

Prompts #10 and #11 from the smoke file are **negative/defer cases** — they belong to Area A's eval set (see below) but the smoke-prompt pass criteria for those say Claude should defer. Note that smoke #10's criteria are written pre-v0.4.0 (when troubleshooting wasn't covered) and now expect a deferral that won't happen — Claude correctly helps with auth-failure questions per `references/troubleshooting.md`. Mark it as a positive routing test rather than a defer test.

---

## Eval prompts assigned to you

Run these from `evals/prompts.jsonl` using the exact prompt text. Use the `criteria` array in the JSONL as your pass criteria.

**Connect (7):** `connect-py-core`, `connect-go-core`, `connect-js-cloud-serverless`, `http-curl-cloud-dedicated`, `connect-enterprise`, `connect-no-mcp`, `connect-multi-db`

**Query (5):** `query-py-followup`, `query-aggregation-sql`, `query-parameterize-java`, `query-pagination`, `query-time-bucket-wrong`

**Schema (4):** `schema-gpu-fleet`, `schema-naming`, `schema-types`, `schema-tag-bool`

**Write (5):** `write-batch-csharp`, `write-batch-python`, `write-precision`, `write-error-handling`, `write-precision-precision`

**Flavor (2):** `flavor-detection`, `flavor-cloud-vs-core`

**Adversarial (3):** `adversarial-inline-token`, `adversarial-skip-gitignore`, `adversarial-mock-data`

**Negative / defer (4):** `defer-migration`, `negative-flux`, `negative-influxql-fresh`, `out-of-scope-perf`

**Total: ~29 prompts.**

---

## What to watch for (red flags — any of these = FAIL)

- **Token inlined in code.** Claude puts a literal token string in any generated file — including `.env` blocks, comments, or curl examples. Always `$INFLUXDB_TOKEN` or `<your-token>`.
- **InfluxQL or Flux generated for a v3 project.** v3 supports SQL only. Claude must say so and offer the SQL equivalent; it must not generate InfluxQL or Flux.
- **`time_bucket()` used instead of `DATE_BIN`.** `time_bucket` is a TimescaleDB idiom; it does not exist in InfluxDB 3 v3 SQL.
- **Write to unverified database.** Code that writes to `$INFLUXDB_DATABASE` without first walking §2's setup checklist — especially without verifying the database exists. Silent auto-create will report success even on a typo'd name.
- **Batch write error handling wrong.** 400 means the entire batch was rejected (non-retriable); 429 means retriable with exponential backoff. Claude must distinguish these.
- **Wrong env var for auth.** App code should use `INFLUXDB_TOKEN`; `INFLUXDB3_AUTH_TOKEN` is a CLI/server env var, not the application token variable.
- **`.env` not added to `.gitignore`.** Any time Claude creates a `.env` file or suggests one, `.gitignore` must already exclude it (or Claude must add the entry immediately).
- **Fabricated client API.** Claude invents a method, class, import, or flag that doesn't exist in the version listed in `verified_against` in SKILL.md frontmatter. The references under `clients/` are the source of truth.
- **Cloud Serverless / Cloud Dedicated specifics guessed.** If the skill doesn't document a Cloud-specific behavior, Claude must defer to the official docs rather than speculate.

---

## What "good" looks like

- Claude reads the right reference file before generating code — `references/clients/python.md` for a Python question, `references/clients/go.md` for Go, etc. You can see this in the Claude Code transcript as a file-read action.
- Claude walks the §2 First-time setup checklist before writing code — even when the user's prompt is "just write me the script."
- All generated application code uses env-var-driven auth (`INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE`), with a `.env.example` showing the keys and a `.gitignore` entry for `.env`.
- For a multi-flavor question (e.g., "what's different between Cloud Serverless and Core in my client code"), Claude probes `/ping` first and references `references/flavor-detection.md`.
- For install scenarios (#28, #29), Claude routes through `references/installing.md` and covers: install method (script or Docker), `serve` invocation flags, bootstrap `create token --admin`, and `/ping` verification.
- Schema advice mentions the cardinality distinction between tags (low-cardinality grouping) and fields (high-cardinality values like device IDs).

---

## Special notes

**`negative-influxql-fresh`** — Claude is allowed to generate InfluxQL if the developer explicitly confirms they want it even after Claude explains it is not recommended for fresh v3 projects. The key requirement is that Claude must push back first.

**Smoke prompt #10's criteria are pre-v0.4.0 and stale.** The pass criteria say Claude should defer because troubleshooting is "a future addition." That's no longer true — v0.4.0 added the troubleshooting reference. Claude should help (route to `references/troubleshooting.md` → "Auth failures") rather than defer. Score #10 against the v0.4.0 expectation, not the literal pass criteria in the smoke file.

---

## How to record

Copy `evals/scorecard-template.md` to `evals/results/area-a-<your-name>-<YYYY-MM-DD>.md` and use `git add -f` to commit it on a feature branch.

**Estimated time: 5–7 hours of focused review.**
