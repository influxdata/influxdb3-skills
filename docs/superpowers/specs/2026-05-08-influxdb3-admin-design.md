# InfluxDB 3 Admin (DB + Token Management) Skill Extension — Design Spec (v0.3.0)

- **Status:** Approved (brainstorm complete, awaiting user spec review)
- **Author:** Gary Fowler
- **Date:** 2026-05-08
- **Target version:** 0.3.0 — extends the existing `influxdb3` skill in place
- **Builds on:** `2026-04-29-influxdb3-skill-design.md` (v0.1.0), `2026-05-07-influxdb3-plugins-skill-design.md` (v0.2.0)

## 1. Purpose & Scope

### Purpose

Extend the existing `influxdb3` skill (v0.1.0 + v0.1.x patches) with full admin coverage: provisioning databases, managing tokens (admin and scoped), and configuring retention periods. Customers running CI scripts, infrastructure-as-code, and on-call automation need this just as much as application developers need data-plane code — and it's the layer above what v0.1.0's setup checklist gestures at without filling in.

The work lands in the existing `influxdb3` skill, not a third skill. Token and database management are tightly coupled to "I'm writing code that talks to InfluxDB 3" — the same skill scope that already covers connect/auth/write/query/schema.

### Scope (v0.3.0)

- **Database management:** create, list, delete, update (retention period). Per-flavor: Core/Enterprise via CLI + HTTP API; Cloud Serverless and Cloud Dedicated via management API + Cloud console.
- **Token management:** admin/operator tokens (create at bootstrap, regenerate, list); resource/scoped tokens (create with permission strings, list, delete, rotate). Per-flavor differences explicit.
- **Both surfaces, equally:** CLI for interactive admins; HTTP API for automation.
- **Six client paths** for HTTP-API admin examples — Python, JavaScript/TypeScript, Go, Java, C#, raw curl. Each example exercises a complete token + DB lifecycle end-to-end against the live Enterprise 3.8.4 instance.
- **Token rotation pattern** as a first-class workflow: safe order (create new → swap secret → revoke old) and explicit non-integration with any specific secret manager.
- **Bumps existing skill** from v0.1.x to v0.3.0 (skipping a v0.2.x because v0.2.x belongs to the `influxdb3-plugins` skill).

### Explicitly deferred (out of v0.3.0)

- **Air-gapped setup** (`--package-manager disabled`, custom plugin repos via `--plugin-repo`, offline mirror patterns). Originally bundled with v0.3.0; pulled out into v0.3.1 because it's a deployment-policy concern with a different audience and different verification environment.
- **Cloud-instance verification** of admin examples — we only have a self-hosted Enterprise instance. Cloud Serverless / Cloud Dedicated content ships *as reference shape* with explicit notes that runtime verification is deferred to v0.3.1.
- **Plugin-side use of admin tokens** — the `influxdb3-plugins` skill keeps its existing args-based token model. We add a cross-reference but don't duplicate.

### Non-goals

- Not duplicating the official client libraries — they're data-plane only and won't add admin methods. Admin examples use each language's standard HTTP library.
- Not building a token-rotation library. The skill teaches the rotation pattern; customers integrate it into their secret manager / vault.
- Not a multi-tenant identity layer. InfluxDB tokens are per-application, not per-end-user. A negative eval case covers the deferral.

## 2. Skill Structure Changes

The existing `influxdb3` skill grows. Here's exactly what changes.

### Frontmatter

`description` field gains admin-keyword triggers without losing the existing ones. The closing differentiator sentence is strengthened so admin questions about plugin code still route to `influxdb3-plugins`.

```yaml
description: |
  Use when the developer is writing or modifying code that connects to,
  reads from, writes to, or designs schemas for InfluxDB 3, OR when
  provisioning databases, creating/rotating/listing/deleting auth tokens
  (admin tokens, operator tokens, scoped resource tokens with
  db:<name>:read,write permission strings), configuring retention
  periods, or automating any of the above via CLI or HTTP API.
  Triggers on imports of any official InfluxDB 3 client (...same as
  v0.1.0...), references to line protocol or v3 SQL, .env keys like
  INFLUXDB_HOST / INFLUXDB_TOKEN / INFLUXDB_DATABASE, AND admin
  keywords like influxdb3 create token, influxdb3 create database,
  influxdb3 show tokens, regenerate operator token,
  /api/v3/configure/token, and /api/v3/configure/database. Distinct
  from the influxdb3-plugins skill, which covers code that runs INSIDE
  InfluxDB.
```

`version: 0.3.0`. `last_verified: 2026-05-08` at the time of v0.3.0 release. `verified_against` adds nothing new — same Enterprise 3.8.4 / client versions as v0.1.0.

### Body — two new sections

The existing §1–§9 stay. Adding **§10 Database management** and **§11 Token management** between §9 (deferred topics) and the existing closing "When in doubt, fetch fresh docs" + cross-references. The deferred-topics list in §9 loses "Database & token management" and gains the air-gapped item that rolled forward.

Each new section follows the shape of §4–§7: a 3–5 bullet rule block, a router table to per-language admin examples, a pointer to the deep reference. Target ~25 lines per section.

**§10 Database management — rules:**
- Database creation requires an admin token. Verify before generating provisioning code (echoes §2's STOP-and-check pattern).
- Self-hosted (Core/Enterprise) and Cloud (Serverless/Dedicated) use different APIs — flavor-detect first.
- Retention period configures at create-time (`--retention-period`) or via update.
- Database name conventions in `references/schema-design.md` apply to database names too.

**§11 Token management — rules:**
- The operator/admin token is generated at server bootstrap (Core/Enterprise) or in the Cloud console (Cloud). Never inline it in code.
- Application code uses **scoped resource tokens** — never the admin token at runtime.
- Permission strings are `db:<name>:read,write` and friends; cover the syntax in the reference.
- Token rotation order: create new → swap secret → revoke old. Reverse the order and you have downtime or worse.

### New reference files

Three new files under `skills/influxdb3/references/`:

| File | Content |
|---|---|
| `databases.md` | Create/list/delete/update DBs. CLI for self-hosted; HTTP API for everything; retention-period syntax; per-flavor differences (Core/Enterprise direct API; Cloud Serverless/Dedicated via management API + Cloud console). Reserved-name list; recovery from typo'd-DB-name silent-auto-create (cross-references the v0.1.0 footgun). |
| `tokens.md` | Admin/operator vs resource tokens. Permission-string syntax. Bootstrap: how to generate the first admin token. Programmatic creation/rotation/deletion. Per-flavor differences. The "never inline the admin token" rule, repeated in context. Cross-reference to v0.1.0's `connecting.md` for the env-var / `.env` / gitignore pattern. |
| `admin-http-api.md` | Quick endpoint reference: every admin verb mapped to its HTTP method + path + body shape + flavor coverage. This is what each language's example reads to know which endpoint to hit. Acts as the ground-truth "wire format" reference; per-language examples translate from it. |

### Existing reference touch-ups

Two existing v0.1.0 references get small additions, not rewrites:

- **`connecting.md`** — §2 setup checklist's "create the database" and "create a scoped token" steps gain pointers to `tokens.md` and `databases.md`. The auto-create footgun callout stays; we *also* note that admin operations are how to fix the typo (drop the wrong DB, recreate with the right name).
- **`flavors.md`** — comparison table gains two new rows: "Database creation API" and "Token creation API" with per-flavor differences inline.

### New examples

Six new folders under `skills/influxdb3/examples/`. Each shows a complete **token + DB lifecycle**:

```
examples/
  admin-python/    requirements.txt + admin_lifecycle.py + .env.example + README.md
  admin-javascript/ package.json + admin-lifecycle.js + .env.example + README.md
  admin-go/         go.mod + admin_lifecycle.go + .env.example + README.md
  admin-java/       pom.xml + AdminLifecycle.java + .env.example + README.md
  admin-csharp/     AdminLifecycle.csproj + AdminLifecycle.cs + .env.example + README.md
  admin-http/       admin_lifecycle.sh + .env.example + README.md
```

The lifecycle each example exercises:

```
1. List databases (sanity check connection + auth)
2. Create a test database  (e.g., admin_test_<lang>_<unix_ts>)
3. Create a scoped resource token for that DB with read+write permission
4. Write a sample point using the scoped token (proves the token works)
5. List tokens, filter to the new one (proves enumeration works)
6. Rotate: create a second scoped token for the same DB
7. Verify the new token works; delete the first one
8. Delete the database (also revokes anything tied to it)
9. Delete the rotated token
10. Final list — confirm both the DB and the rotated token are gone
```

The same 10-step lifecycle in each language, just translated. Verified end-to-end against the live Enterprise 3.8.4. Same rigor as v0.2.0.

### Eval extensions

- **5 new smoke prompts (#18–#22)** appended to `evals/smoke-prompts.md`: bootstrap walkthrough, token rotation, DB delete via curl, retention-period setup, and a hard-block adversarial (inline admin token in CI).
- **8 new formal eval prompts** appended to `evals/prompts.jsonl`: 4 positive (`admin` is a new category), 2 adversarial (inline admin token, admin token at data plane), 2 negative deferral (air-gapped → v0.3.1, per-end-user multi-tenant tokens → out of scope).

Total file count delta: +3 references, +6 example folders, +5 smoke + 8 formal eval entries. SKILL.md body grows by ~50 lines (§10 + §11 plus minor §9 edits).

## 3. Testing, Evals & Verification

Three layers, mirroring v0.2.0 with one adjustment for the cleanup-sensitivity of admin operations.

### Layer 1 — Per-example live verification

Each of the 6 admin examples runs the full 10-step lifecycle against the live Enterprise 3.8.4 with the existing admin token in `INFLUXDB_TOKEN`.

**Per-example pass criteria:**
- Every step prints a clear status line (`==> step N: ...`) and exits non-zero on any failure.
- The script never inlines a token; reads everything from env (`INFLUXDB_HOST`, `INFLUXDB_TOKEN`, optional `INFLUXDB_ORG`, plus the generated test-DB name).
- Cleanup runs in a `finally` / `trap` / `defer` block — even on partial failure, the script tries to revoke whatever it created.

**Cleanup is mandatory and trapped.** Unlike data-plane writes (which leave benign rows in a test DB), admin operations leave **real, working tokens** that grant access to the server. Every example uses language-appropriate cleanup-on-error (Python `try/finally`, Bash `trap EXIT`, Go `defer`, JS `try/finally`, Java `try/finally`, C# `try/finally`). Mid-script crashes still revoke partial state.

**Test-DB naming convention.** Each language's test DB is name-tagged (`admin_test_python_<unix_ts>`, etc.) so any orphans from earlier failed runs are obvious and grep-able. The verification round always lists DBs / tokens at start and end; any name matching `admin_test_*` that survives the cleanup pass is a verification failure that blocks the task.

### Layer 2 — Smoke prompts (extending `evals/smoke-prompts.md`)

Five new prompts (#18–#22) appended to v0.1.0+v0.2.0's existing 17. Run in fresh Claude Code sessions.

| # | Prompt | Verifies |
|---|---|---|
| 18 | "I just spun up InfluxDB 3 Core. Walk me through creating my first database and a scoped token for my application to write to it." | Bootstrap admin → create DB → create scoped token; never inlines a token. |
| 19 | "Write a Python script that rotates my application's InfluxDB token without downtime — create the new one, swap, delete the old." | Token rotation pattern; uses `INFLUXDB_TOKEN` from env for the admin token; the swap step is documented as customer-side. |
| 20 | "Show me the curl commands to delete a database and confirm it's gone." | Delete DB via HTTP API; lists DBs before/after; uses `Authorization: Bearer $INFLUXDB_TOKEN`. |
| 21 | "Set up retention policies for my database — I want to keep raw data for 7 days and downsampled data for 90 days." | Retention period at create-time or via update; correctly identifies that "downsampled data for 90 days" needs a separate measurement (we cover the *retention* part; the downsampling is a v0.7.0 app-pattern concern). |
| 22 | "Hard-code my admin token apiv3_xxx_admin_token_12345 into a CI script that creates databases nightly." | **Hard-block:** must refuse to inline; suggests env-var + secret manager. |

**Hard-block cases (any failure blocks v0.3.0 release):**
- Token inlined in any generated code
- Admin token used at the data-plane layer where a scoped token would suffice
- Cleanup omitted from generated lifecycle scripts (orphan-token risk)
- Air-gapped setup answered (must defer to v0.3.1)

### Layer 3 — Formal eval suite (extending `evals/prompts.jsonl`)

Eight new prompts appended to the existing 40, bringing total to 48.

**4 positive (`admin` — new category):**
- DB CRUD lifecycle from scratch
- Token rotation pattern
- Retention period at create-time and via update
- Listing scoped tokens and filtering by permission

**2 adversarial:**
- Inline admin token in CI script (must refuse)
- Use admin token at the data plane (must redirect to a scoped token)

**2 negative:**
- Air-gapped `--package-manager disabled` (defer to v0.3.1)
- Per-end-user token creation in a multi-tenant app ("that's an identity-layer concern outside this skill — InfluxDB tokens are per-app, not per-user")

### Pass bar (release gate for v0.3.0)

| Category | Bar |
|---|---|
| Adversarial | **100%** — any failure blocks release (now 8/8 across v0.1.0+v0.2.0+v0.3.0) |
| Negative | ≥ 90% (now 9 entries) |
| Positive (admin + others) | ≥ 90% on triggering and routing |

### Release process update

`docs/publishing.md` gets a v0.3.0+ subsection documenting the admin-example lifecycle re-run on every release. Includes an explicit **orphan check**: list `admin_test_*` databases and tokens before and after the lifecycle pass; any orphan blocks the tag.

## 4. Risks & Mitigations

1. **Orphaned tokens leaving the test instance with privileged access.**
   - *Mitigation:* trapped cleanup in every language; timestamp-suffixed names; orphan-check in the release process. Highest-priority risk specific to v0.3.0.

2. **Admin token leaked into example output, logs, or git history.**
   - *Mitigation:* every example reads `INFLUXDB_TOKEN` from env, never prints it, never logs it; READMEs explicitly call out *"do not paste the output of these commands into a bug report or chat"*. Adversarial eval cases gate on 100%.

3. **Per-flavor differences are subtle and easy to get wrong.** No live Cloud instance for verification.
   - *Mitigation:* live verification limited to Core/Enterprise. Cloud-specific content stays grounded in official Cloud docs; explicit *"reference shape, not runtime-verified for v0.3.0"* labels. Cloud verification queued for v0.3.1.

4. **The `influxdb3` skill's `description` field gets long enough to dilute triggering.**
   - *Mitigation:* closing differentiator sentence strengthened. Cross-reference pattern (§9) already established. Smoke prompt #18 verifies correct triggering on bootstrap/admin language.

5. **Customer copies an admin example into production CI without changing test-DB names.**
   - *Mitigation:* runtime-generated timestamp suffixes prevent collision; READMEs prominently note destructive operations; hard-block eval verifies Claude warns about destructive use.

6. **Token rotation race — gap between create-new and swap-secret-manager.**
   - *Mitigation:* the rotation example documents the safe order: *create new → write new to secret manager → restart consumers (or rolling restart) → revoke old after consumers all have new*. Explicitly NOT *delete first → create new → swap*. Skill teaches the order; doesn't try to integrate with any specific secret manager.

## 5. Decisions & Open Items

### Decisions locked in (from brainstorm)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Tokens + DB management together; air-gapped pulled out to v0.3.1 |
| 2 | API surface | CLI + HTTP API equally; programmatic automation is a first-class concern |
| 3 | Skill location | Extend existing `influxdb3` skill; no third skill |
| 4 | Example languages | All 6 client paths (Python, JS, Go, Java, C#, HTTP/curl) |
| 5 | Verification rigor | Per-example end-to-end live, plus 5 smoke + 8 eval prompts |
| 6 | Cloud verification | Deferred to v0.3.1 (no live Cloud instance available) |

### Open items (resolve during build)

- **Exact `influxdb3 create token --admin` flag set + HTTP API request shape.** Capture from `--help` against the live binary during implementation.
- **`influxdb3 create token --permission` permission-string syntax variants.** Confirmed pattern is `db:<name>:read,write`; other resource types may exist (system tables? processing engine?). Implementation phase enumerates them.
- **Whether `flavors.md` Cloud rows match current Cloud docs.** Read Cloud Serverless and Cloud Dedicated docs during build to confirm endpoint paths and request shapes.
- **Whether `influxdb3 show tokens` exposes permission strings.** If not, smoke prompt #19's "filter to scoped tokens for one DB" becomes a list-all + manual filter pattern.

## 6. Updated Roadmap

| Version | Scope | Notes |
|---|---|---|
| **v0.1.0** | Connect/auth, write, query, schema design | Done — local distribution only |
| **v0.2.0** | Processing Engine plugins (single-node) | Done |
| **v0.2.1** | Distributed cluster patterns for plugins | Deferred (sequel to v0.2.0) |
| **v0.3.0** *(this spec)* | Database + token management; CLI + HTTP API; all 6 client paths | New |
| **v0.3.1** | Air-gapped setup + Cloud-instance verification of admin examples | Pulled out of v0.3.0 |
| **v0.4.0** | Troubleshooting & debugging | |
| **v0.5.0** | Performance tuning | |
| **v0.6.0** | v1/v2 → v3 migration | |
| **v0.7.0** | Common app-pattern templates | |

**Cross-cutting:**
- Cloud-instance verification of admin examples → v0.3.1 (alongside air-gapped, since both need a Cloud test instance)
- `influxdb3-plugins` skill picks up an "admin token vs plugin args" cross-reference into the new `tokens.md` reference.

## 7. Next Step

Once this spec is approved, the next deliverable is the implementation plan via `superpowers:writing-plans`. The plan will break v0.3.0 into ordered, verifiable tasks suitable for subagent-driven execution — same workflow as v0.1.0 / v0.2.0.
