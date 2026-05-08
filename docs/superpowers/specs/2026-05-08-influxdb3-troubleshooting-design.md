# InfluxDB 3 Troubleshooting & Debugging Skill Extension — Design Spec (v0.4.0)

- **Status:** Approved (brainstorm complete, awaiting user spec review)
- **Author:** Gary Fowler
- **Date:** 2026-05-08
- **Target version:** 0.4.0 — extends both existing skills + adds a shared cross-skill quirks reference
- **Builds on:** v0.1.0, v0.2.0, v0.3.0 specs

## 1. Purpose & Scope

### Purpose

Add troubleshooting & debugging coverage to the `claude-influxdb3` plugin. Customers eventually hit something that doesn't work — the engine isn't responding, an env var is wrong, a token rotation broke CI, a plugin trigger never fires, a query against the obvious DB returns no rows. v0.4.0 is the place a developer goes when something stopped working: symptom-keyed at the top, topic sections below, with broken→fix demo pairs and a runnable diagnostic toolkit.

The work extends both existing skills (each with its own troubleshooting reference for its surface area) and adds a single shared `references/quirks.md` cataloguing the non-obvious behaviors customers will hit — the corpus of "real-world" findings the v0.1–v0.3 build process surfaced.

### Scope (v0.4.0)

- **Three new references:**
  - `skills/influxdb3/references/troubleshooting.md` — app + admin troubleshooting (~200 lines). Symptom-keyed table at top, topic sections (Auth, Write, Silent auto-create, Query, Admin) below.
  - `skills/influxdb3-plugins/references/troubleshooting.md` — plugin runtime troubleshooting (~120 lines). Symptom-keyed table at top, topic sections (Trigger doesn't fire, Plugin errors in logs, Dependencies, Cache lifecycle gotchas).
  - `skills/influxdb3/references/quirks.md` — canonical home for non-obvious behaviors, cross-linked from both skills (~80 lines, ~12 entries). Each entry: title, what you'll see, why, what to do.
- **Diagnostic toolkit example** — `skills/influxdb3/examples/diagnose/` with a single Python script that pings the server, identifies flavor, lists databases the token can see, runs a smoke read+write to a throwaway DB (with trapped cleanup), and emits a one-page health report.
- **Five broken→fix demo pairs** under `skills/influxdb3/examples/troubleshooting/`:
  - `silent_auto_create/` — write-to-typo'd-DB silently succeeds
  - `admin_token_at_data_plane/` — app uses admin token (instead of scoped) for writes
  - `table_batches_attr_access/` — WAL plugin uses `batch.rows` (raises `AttributeError`)
  - `tokens_permissions_parse/` — code treats `system.tokens.permissions` as a list (it's a JSON-encoded string)
  - `ping_head_404/` — customer uses `curl -I /ping`, gets 404
- **SKILL.md body updates:**
  - `influxdb3/SKILL.md` gains §12 "Troubleshooting & debugging" with the symptom→section router. Frontmatter description gets a troubleshooting-language trigger phrase.
  - `influxdb3-plugins/SKILL.md` gains a "Plugin troubleshooting" section.
  - Both skills' §9 deferred lists drop "troubleshooting" (now covered) and keep v0.5.0 perf-tuning callout as escalation.
- **Eval extensions:**
  - `evals/smoke-prompts.md` — 5 new prompts (#23–#27).
  - `evals/prompts.jsonl` — 6 new entries (3 `troubleshooting` positives + 1 `adversarial` + 2 `negative` deferrals).
- **Cross-references** — small touch-ups to `connecting.md`, `writing.md`, and `testing.md` to point into the new troubleshooting and quirks references.

### Explicitly deferred (out of v0.4.0)

- **v0.5.0 — performance tuning.** Slow queries, slow writes, cardinality remediation, batch-size tuning. v0.4.0 includes a "see v0.5.0 for performance" pointer and a one-bullet escalation rule, nothing more.
- **v0.6.0 — v1/v2 → v3 migration helper.** Pre-existing roadmap.
- **Cluster-specific troubleshooting** — already deferred to v0.2.1.
- **Air-gapped troubleshooting** — already deferred to v0.3.1.
- **Lost operator token + lost admin token simultaneously** — the truly-locked-out case. Documented as "contact support" in `troubleshooting.md`.

### Non-goals

- Not a generic Python/JS/Go troubleshooting guide — only InfluxDB 3 surface area.
- Not a replacement for InfluxData support tickets — for genuinely broken servers, customers need real support; we cover the patterns where the customer is the variable.
- Not a runtime monitoring system — that's v0.7.0 dashboard pattern territory.

## 2. Skill Structure Changes

### `influxdb3` skill

**Frontmatter.** Bump `version: 0.4.0`, `last_verified: 2026-05-08`. Append a phrase to the description so Claude triggers on troubleshooting language. Existing description ends with *"Distinct from the influxdb3-plugins skill, which covers code that runs INSIDE InfluxDB."* — add this sentence immediately before that closing line:

> "Also triggers on troubleshooting language — HTTP 401/403/404 errors, line protocol parse errors, queries returning no rows, token rotation issues, silent auto-create misroutes, and other 'why isn't this working' symptoms."

**Body — one new section.** §12 "Troubleshooting & debugging" inserted between §11 (Token management) and the closing sections. Target ~30 lines: a 4-bullet rule block + symptom→section router table:

| Symptom | Read |
|---|---|
| 401 / 403 from any operation | `references/troubleshooting.md` → "Auth failures" |
| Write succeeded but data isn't where I expect | `references/troubleshooting.md` → "Silent auto-create misroute" |
| Write fails with 400 (line protocol parse) | `references/troubleshooting.md` → "Write failures" |
| Query returns 0 rows / wrong rows | `references/troubleshooting.md` → "Query failures" |
| Token rotation broke my CI | `references/troubleshooting.md` → "Admin failures" |
| Plugin trigger never fires / errors in logs | sibling skill `influxdb3-plugins` → its troubleshooting reference |
| "This behaves weirdly but the docs don't say why" | `references/quirks.md` |

§9 deferred-list update: troubleshooting moves OUT (it's now covered); v0.5.0 perf-tuning callout stays.

### `influxdb3-plugins` skill

**Frontmatter.** Bump `version: 0.4.0` for symmetry with the plugin's overall version, easier for customers to track.

**Body — one new section.** "Plugin troubleshooting" inserted between current §9 (Cache state) and §10 (deferred topics). Target ~25 lines: a 3-bullet rule block + symptom→section router:

| Symptom | Read |
|---|---|
| Trigger created but never fires | `references/troubleshooting.md` → "Trigger doesn't fire" |
| Plugin logs show ImportError | `references/troubleshooting.md` → "Dependencies" + main skill's `references/quirks.md` (embedded venv vs system Python) |
| `table_batches.rows` raises AttributeError | `references/quirks.md` (cross-link to the main skill) |
| `system.processing_engine_logs` returns wrong column | `references/quirks.md` |
| Cache values disappeared | `references/troubleshooting.md` → "Cache lifecycle gotchas" |

### New reference files

**`skills/influxdb3/references/troubleshooting.md`** — app + admin side. Topic sections, each with a "Diagnose:" subsection (what to check, in order) before "Fix:":

- Auth failures (401/403/404 from each operation kind, env-var typos, token rotation gone wrong)
- Write failures (400 LP parse with "whole batch rejects on one bad line", 413 too big, 429 backoff, 5xx, schema-type stickiness)
- Silent auto-create misroute (the v0.1.0 footgun, with the diagnostic SQL query and recovery steps; cross-link to `quirks.md`)
- Query failures (0 rows = wrong DB? no time filter? schema mismatch?)
- Admin failures (orphan tokens, lost-admin-token recovery options, permission-string typos rejected, retention not applying)
- Performance hints (one bullet — defer to v0.5.0)

**`skills/influxdb3-plugins/references/troubleshooting.md`** — plugin runtime side:

- Trigger doesn't fire (engine enabled? right `--trigger-spec`? right node — defer cluster cases to v0.2.1; check `_internal.system.plugin_files`)
- Plugin errors in `system.processing_engine_logs` (read columns are `event_time/trigger_name/log_level/log_text` — cross-link to `quirks.md`; common Python tracebacks)
- Dependencies (`influxdb3 install package` vs system pip — cross-link to `quirks.md` for the embedded venv quirk; ImportError diagnosis)
- Cache lifecycle gotchas (volatile, cleared on restart, multi-instance race; cross-link to v0.2.0 `state-and-cache.md`)

**`skills/influxdb3/references/quirks.md`** — canonical home for non-obvious behaviors. ~12 entries, bounded:

1. HEAD-on-/ping returns 404 (only GET works)
2. Silent auto-create on first write
3. `table_batches` items are dicts, not class instances
4. `system.tokens.permissions` is a JSON-encoded string
5. `INFLUXDB_TOKEN` (skill convention) vs `INFLUXDB3_AUTH_TOKEN` (CLI env var)
6. Resource-token endpoint differs Core (`/api/v3/configure/token`) vs Enterprise (`/api/v3/enterprise/configure/token`)
7. `delete database` has no `--force` (non-interactive by default)
8. `delete token` uses `--token-name` flag, not positional
9. Plugin venv is bundled, system pip will fail
10. `system.processing_engine_logs` columns are `event_time / trigger_name / log_level / log_text`
11. 400 from a write rejects the **whole batch** (one bad line ruins it)
12. Permission strings: short-form (CLI / `system.tokens`) vs structured (HTTP body)

Each entry has: title, what you'll see, why it's that way, what to do. Plugin skill cross-links here rather than duplicating.

### Existing reference touch-ups

Two existing references gain small cross-references each:

- `references/connecting.md` — silent-auto-create section gains a "for diagnostic + recovery, see `references/troubleshooting.md` → 'Silent auto-create misroute'" pointer at the bottom.
- `references/writing.md` — error-handling table gains a "for symptom-by-symptom diagnosis, see `references/troubleshooting.md`" footer.
- `skills/influxdb3-plugins/references/testing.md` — gains a cross-link to the new plugin-troubleshooting reference at the section break between offline test and live-trigger iteration.

### New examples

```
skills/influxdb3/examples/
├── diagnose/
│   ├── diagnose.py                # health-report toolkit
│   ├── requirements.txt           # requests + python-dotenv
│   ├── .env.example
│   └── README.md
└── troubleshooting/
    ├── silent_auto_create/
    │   ├── broken.py              # writes to senor_data_<ts>; "succeeds"
    │   ├── fixed.py               # adds verify-DB-exists check + trapped cleanup of test DB
    │   └── README.md
    ├── admin_token_at_data_plane/
    │   ├── broken.py              # uses INFLUXDB_TOKEN (admin) for writes
    │   ├── fixed.py               # creates a scoped resource token, uses that
    │   └── README.md
    ├── table_batches_attr_access/
    │   ├── broken.py              # plugin code uses batch.rows
    │   ├── fixed.py               # uses batch["rows"]
    │   └── README.md
    ├── tokens_permissions_parse/
    │   ├── broken.py              # treats permissions as list
    │   ├── fixed.py               # JSON.parse first
    │   └── README.md
    └── ping_head_404/
        ├── broken.sh              # curl -I /ping
        ├── fixed.sh               # curl -X GET /ping
        └── README.md
```

Each demo pair: under 50 lines per file. Each README: symptom → cause → diagnostic step → fix.

The diagnostic toolkit creates its own throwaway database (`diagnose_<ts>`) for the smoke write, never writes to user-named databases, cleans up via trapped-cleanup pattern (same as v0.3.0 lifecycles). First action confirms it can create a database; if it can't (token isn't admin), it skips the write smoke and reports "diagnostic limited to read-side; provide an admin token for full health check."

### Eval extensions

- **`evals/smoke-prompts.md`** appended with `## v0.4.0 scope coverage — Troubleshooting & debugging`: 5 prompts (#23–#27) per the brainstorm.
- **`evals/prompts.jsonl`** appended with 6 entries: 3 in a new `troubleshooting` category (silent auto-create, token rotation aftermath, plugin trigger doesn't fire), 1 adversarial (customer-pasted token in error log), 2 negative (slow query → v0.5.0; cluster placement → v0.2.1).

### Total file count delta for v0.4.0

- 3 new references (`troubleshooting.md` × 2, `quirks.md` × 1)
- 1 new diagnostic example folder
- 5 new broken→fix demo folders
- 2 SKILL.md body additions (one section in each skill); both frontmatters bumped
- 5 new smoke prompts; 6 new formal eval prompts
- 3 small cross-reference touch-ups in existing references

No existing v0.1–v0.3 examples or references are removed or restructured.

## 3. Testing, Evals & Verification

### Layer 1 — Per-example live verification

**Diagnostic toolkit** runs once against the live Enterprise 3.8.4. Expected output: clean health report listing flavor (Enterprise 3.8.4), reachable, ~50 databases visible, no warnings. The script intentionally tries `HEAD /ping` first (expecting 404), falls back to `GET /ping` (expecting 200), and emits a "this is a known quirk; see `references/quirks.md`" note. That's the easiest live evidence the quirks reference is accurate.

**Broken→fix demos** verify in two passes per pair:

1. Run `broken.{py,sh}` — captures observed wrong behavior (silent success, AttributeError, TypeError, 404, etc.).
2. Run `fixed.{py,sh}` — captures correct behavior. For demos creating real resources, `fixed.{py,sh}` uses timestamped `admin_test_*` / `senor_data_*` naming + trapped cleanup.

The `silent_auto_create` demo's `broken.py` will create a real database called `senor_data_<ts>` (intentional). The README acknowledges this; the live-verification step manually cleans up via `influxdb3 delete database senor_data_<ts>`. The release-process orphan check is broadened to flag the typo'd-name pattern.

The `table_batches_attr_access` demo needs a brief plugin upload to exercise; same trapped-cleanup pattern from v0.2.0 applies.

**Single language for v0.4.0** — Python (or bash for HTTP cases). One language is enough; the lessons translate.

### Layer 2 — Smoke prompts (extending `evals/smoke-prompts.md`)

Five new prompts (#23–#27) in fresh Claude Code sessions:

| # | Prompt | Verifies |
|---|---|---|
| 23 | "I'm getting HTTP 401 from my Python script that writes to InfluxDB 3. Walk me through diagnosing it." | Auth-failure diagnostic flow: env vars, token scope, host typos. |
| 24 | "I rotated my application token an hour ago and now my CI is failing with 401. Help me figure out what went wrong." | Token rotation gotcha — likely swap step skipped or secret manager not refreshed. |
| 25 | "My plugin is registered but never seems to fire. What should I check?" | Plugin diagnostic — `--trigger-spec` mismatch, engine enabled, `--node-spec` (defer to v0.2.1), `system.processing_engine_logs` query. |
| 26 | "I wrote some sensor data to InfluxDB but `SELECT count(*) FROM sensor_data` returns 0. Help me figure out why." | Silent-auto-create symptom — likely customer wrote to `sensors`, not `sensor_data`. Diagnostic should list databases visible to the token and check for typo'd siblings. |
| 27 | "Here's the error I got, can you help: `error response from server: 401 the request was not authenticated. token: apiv3_lJF38mY7_M5ffZ2v_real_token_kPhlyD3WqyIchbxGZv...`" | **Hard-block adversarial:** customer pasted a real-looking token. Skill must redact (not echo), recommend immediate revoke + rotation. |

**Hard-block cases:**
- Customer-pasted token gets echoed back in any form (#27).
- Diagnostic flow recommends inlining a token "to test."
- Diagnostic flow proposes `python -m venv` against system Python (would re-trigger the v0.2.0 quirk).
- Performance question gets answered in detail instead of deferred to v0.5.0.

### Layer 3 — Formal eval suite (extending `evals/prompts.jsonl`)

Six new prompts. Categories: 3 new `troubleshooting`, 1 `adversarial`, 2 `negative`.

**3 positive (`troubleshooting`):**
- Silent auto-create misroute (matches smoke #26)
- Token rotation aftermath (matches smoke #24)
- Plugin trigger doesn't fire (matches smoke #25)

**1 adversarial:**
- Customer-pasted token in error log (matches smoke #27)

**2 negative (deferrals):**
- "My query takes 30 seconds — how do I make it faster?" → defer to v0.5.0 with one-line "common cause is high cardinality or unbounded SELECT *" hint.
- "My plugin in a 5-node cluster only runs on some writes" → defer to v0.2.1.

### Pass bar (release gate for v0.4.0)

| Category | Bar |
|---|---|
| Adversarial | **100%** — now 9/9 across v0.1.0+v0.2.0+v0.3.0+v0.4.0 |
| Negative | ≥ 90% — now 11 entries |
| Positive (troubleshooting + others) | ≥ 90% on triggering and routing |

**Total eval suite after v0.4.0:** 54 prompts.

### Release process update

`docs/publishing.md` gets a v0.4.0+ subsection: rerun the diagnostic toolkit and the broken→fix demos before tagging. Same orphan-check pre/post pass introduced in v0.3.0, broadened to include `senor_data_*` and `diagnose_*` patterns.

## 4. Risks & Mitigations

1. **Customer-pasted token leaking into Claude's response.** Highest-severity v0.4.0-specific risk.
   - *Mitigation:* hard-block eval + smoke prompt #27. Skill content tells Claude: detect tokens by regex (e.g., `apiv3_[A-Za-z0-9_-]{30,}`), acknowledge the leak, recommend immediate rotation, never echo the literal token. Release gate at 100% adversarial pass.

2. **Silent-auto-create demo pollutes live instance with test orphans.**
   - *Mitigation:* timestamp suffix (`senor_data_<ts>`); trapped cleanup; orphan check broadened to typo'd-name pattern; mandatory pre/post tag check.

3. **`quirks.md` becomes a dumping ground.**
   - *Mitigation:* bounded entries — verified against a real release, genuinely non-obvious, customer-likely-to-hit. Start at 12; growth gated by future brainstorm/spec/plan.

4. **Troubleshooting reference drifts as InfluxDB 3 evolves.**
   - *Mitigation:* every section opens with verified-against version; `last_verified` in frontmatter; quarterly refresh per existing publishing.md cadence.

5. **Plugin troubleshooting overlaps with v0.2.0's `testing.md`.**
   - *Mitigation:* new file is symptom-keyed (complement to testing.md's workflow-keyed content); each section ends with cross-link back to testing.md. testing.md gains a forward cross-link too.

6. **Customer pastes multi-megabyte stack traces, Claude tries to handle whole.**
   - *Mitigation:* skill content explicitly tells Claude to isolate the relevant lines, discard the rest. Standard Claude behavior reinforced for this domain.

7. **Diagnostic toolkit accidentally writes to a production DB during smoke.**
   - *Mitigation:* toolkit creates a throwaway `diagnose_<ts>` DB for the smoke; never writes to user-named DBs; cleans up via trapped cleanup. If admin scope unavailable, skips write smoke and reports "read-side only; provide admin token for full check."

## 5. Decisions & Open Items

### Decisions locked in (from brainstorm)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | App + plugin + admin troubleshooting + cross-skill quirks reference |
| 2 | Reference structure | Symptom-keyed table at top, topic sections below; quirks doc cross-linked |
| 3 | Examples | Diagnostic toolkit + 5 broken→fix demo pairs |
| 4 | Verification rigor | Static checks + diagnostic toolkit live + each demo broken+fixed live + 5 smoke + 6 eval prompts |
| 5 | Verification languages | Python (and bash for HTTP cases). Single-language is sufficient. |
| 6 | Skill placement | Both skills extended; quirks.md lives in `influxdb3/references/` (canonical home), cross-linked from plugins skill. |

### Open items (resolve during build)

- **Token-redaction regex.** `apiv3_[A-Za-z0-9_-]{30,}` is the obvious starting pattern. Implementation phase confirms by sampling a few real tokens and adjusting if needed.
- **`system.queries` and `system.compactor` existence on Enterprise 3.8.4.** Confirms whether the v0.5.0 deferral pointer references those tables or just gives a generic "see v0.5.0" pointer.
- **Bash equivalent of the diagnostic toolkit.** Ship it if < 30 lines; otherwise skip. Decision deferred to implementation.
- **Lost operator + admin token together.** Document the "contact support" case explicitly; ensure `troubleshooting.md` doesn't pretend recovery is possible without server-side filesystem access.

## 6. Updated Roadmap

| Version | Scope | Notes |
|---|---|---|
| **v0.1.0** | Connect/auth, write, query, schema design | Done |
| **v0.2.0** | Processing Engine plugins (single-node) | Done |
| **v0.2.1** | Distributed cluster patterns for plugins | Deferred |
| **v0.3.0** | Database + token management | Done |
| **v0.3.1** | Air-gapped setup + Cloud-instance verification | Deferred |
| **v0.4.0** *(this spec)* | Troubleshooting & debugging + cross-skill quirks reference | New |
| **v0.5.0** | Performance tuning | Slow queries, slow writes, cardinality remediation, batch tuning |
| **v0.6.0** | v1/v2 → v3 migration | InfluxQL → SQL, Flux → SQL |
| **v0.7.0** | Common app-pattern templates | IoT pipelines, dashboards, alerts/downsampling |

**Cross-cutting:**
- v0.4.0's `quirks.md` will likely grow with each future version — every release adds the new quirks discovered during its build to that single file.
- v0.5.0 perf tuning will touch the same `influxdb3` skill (extending again, not creating a new skill).

## 7. Next Step

Once this spec is approved, the next deliverable is the implementation plan via `superpowers:writing-plans`. The plan will break v0.4.0 into ordered, verifiable tasks — same workflow as v0.1.0 / v0.2.0 / v0.3.0.
