# InfluxDB 3 Claude Skill — v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1.0 InfluxDB 3 Claude Code skill (Connect & authenticate, Write data, Query data, Schema design) for local development, with first-class support for Python, JS/TS, Go, Java, C#, and a raw HTTP fallback covering all four InfluxDB 3 flavors (Core, Enterprise, Cloud Serverless, Cloud Dedicated).

**Architecture:** A Claude Code plugin with a single skill (`skills/influxdb3/`) consisting of a tight `SKILL.md` router, a `references/` folder for depth, an `examples/` folder of runnable hello-world scripts, an `evals/` folder for prompt-based regression testing, and a `.claude-plugin/plugin.json` manifest. Distributed locally via symlink into `~/.claude/plugins/` for v1; no public publish.

**Tech Stack:** Markdown + YAML frontmatter for the skill content; Bash, Python, JS/TS (Node), Go, Java, C#, and curl for runnable examples; `anthropic-skills:skill-creator` eval harness for regression testing.

**Spec reference:** `docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md`. Read it before starting — every reference doc and example is shaped by it.

**TDD adaptation for skill content:**
- For runnable example scripts: the test is "does the script run and produce the expected output against a real InfluxDB 3 instance?" Real, executable verification.
- For skill content (`SKILL.md` and `references/`): the test is "in a fresh Claude Code session, given prompt X, does Claude trigger the skill, route to the right reference, and produce a correct answer?" Verification is observed, not automated, until the formal eval suite (Task 22).
- The smoke-prompt list (Task 2) is written early so it functions as the test spec for the whole build.

**Pre-flight checks before starting:**
- Working directory exists at `~/Projects/claude-influxdb3/` (already created during brainstorming).
- A live InfluxDB 3 instance is available for testing example scripts. Either local Core (`influxdb3 serve --object-store=memory`) or Cloud Serverless. Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in your shell.
- Claude Code is installed and you can launch fresh sessions for skill verification.

---

## Phase 1: Bootstrap

### Task 1: Repo skeleton, plugin manifest, license, gitignore

**Files:**
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `CHANGELOG.md`
- Create: `.claude-plugin/plugin.json`
- Create: `README.md` (minimal placeholder; expanded in Task 23)
- Modify: `~/.claude/plugins/` (add symlink)

- [ ] **Step 1: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 InfluxData, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `.gitignore`**

```
# Local secrets - never commit these
.env
.env.*
!.env.example

# Editor / OS
.DS_Store
.idea/
.vscode/
*.swp
*~

# Language artifacts produced when running examples
__pycache__/
*.pyc
node_modules/
*.class
target/
bin/
obj/

# Eval run output
evals/results/
```

- [ ] **Step 3: Write `CHANGELOG.md` placeholder**

```markdown
# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial v1.0 development in progress.
```

- [ ] **Step 4: Write `.claude-plugin/plugin.json`**

```bash
mkdir -p .claude-plugin
```

```json
{
  "name": "claude-influxdb3",
  "version": "0.1.0",
  "description": "Teach Claude Code to write correct InfluxDB 3 code (connect, write, query, schema design) across Core, Enterprise, Cloud Serverless, and Cloud Dedicated, in Python, JavaScript, Go, Java, C#, and raw HTTP.",
  "author": {
    "name": "Gary Fowler",
    "email": "garyfowler2015@gmail.com"
  },
  "license": "MIT",
  "skills": [
    "skills/influxdb3"
  ]
}
```

- [ ] **Step 5: Write minimal `README.md`** (full version in Task 23)

```markdown
# claude-influxdb3

A Claude Code skill that teaches Claude how to write correct InfluxDB 3 code — connect, write, query, and design schemas — across Core, Enterprise, Cloud Serverless, and Cloud Dedicated, in Python, JavaScript, Go, Java, C#, or raw HTTP.

**Status:** v0.1.0 in development (local only).

See `docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md` for the design and `docs/superpowers/plans/2026-04-29-influxdb3-skill-v1.md` for the build plan.
```

- [ ] **Step 6: Create the symlink so the plugin is live during development**

```bash
mkdir -p ~/.claude/plugins
ln -s ~/Projects/claude-influxdb3 ~/.claude/plugins/claude-influxdb3
ls -la ~/.claude/plugins/claude-influxdb3
```

Expected: `ls -la` shows the symlink resolving to `/Users/garyfowler/Projects/claude-influxdb3`.

- [ ] **Step 7: Verify file structure**

```bash
cd ~/Projects/claude-influxdb3
find . -type f -not -path './.git/*' | sort
```

Expected: prints `LICENSE`, `.gitignore`, `CHANGELOG.md`, `README.md`, `.claude-plugin/plugin.json`, plus the existing `docs/superpowers/specs/...` and `docs/superpowers/plans/...`.

- [ ] **Step 8: Commit**

```bash
git add LICENSE .gitignore CHANGELOG.md README.md .claude-plugin/plugin.json
git commit -m "chore: initial repo skeleton and plugin manifest"
```

---

### Task 2: Smoke-test prompts (the test spec for the whole build)

This is the "tests first" step — these prompts are how we validate every later task.

**Files:**
- Create: `evals/smoke-prompts.md`

- [ ] **Step 1: Create `evals/` and write `evals/smoke-prompts.md`**

```bash
mkdir -p evals
```

````markdown
# Smoke-Test Prompts

These are the manual smoke tests for the InfluxDB 3 skill. Each prompt represents how a real customer would phrase a request — not a clean-room API question. Pass criteria: Claude triggers the `influxdb3` skill, routes to the right reference, and produces correct, runnable code (when code is asked for) or defers politely (when out of scope).

Run each prompt in a **fresh** Claude Code session (so the skill is loaded cleanly) inside any throwaway test directory.

## v1 scope coverage

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 1 | "I just spun up InfluxDB 3 Core locally. Write me a Python script that connects and writes some sample sensor data." | Connect + write, Python, Core | Code uses `influxdb3-python`, reads `INFLUXDB_HOST`/`INFLUXDB_TOKEN`/`INFLUXDB_DATABASE` from env, never inlines a token, uses line protocol. |
| 2 | "Add to that script — query the last 10 minutes of data and print the rows." | Query, Python, SQL primary | Uses SQL `SELECT ... WHERE time >= now() - INTERVAL '10 minutes'` (or equivalent), parameterized if user input is involved. |
| 3 | "Now do the same thing in Go." | Cross-language portability | Uses official `influxdb3-go` client, same env vars, no hard-coded host. |
| 4 | "I'm targeting Cloud Serverless. Set up the connection in JavaScript." | Flavor switch, JS/TS | Uses `@influxdata/influxdb3-client`, points at the Cloud Serverless host pattern, notes the v2 write path for Serverless if relevant. |
| 5 | "Help me design a schema for tracking GPU utilization across a fleet of 50,000 GPUs." | Schema design, cardinality | Calls out that GPU ID should be a **field** (not a tag) due to cardinality; tags reserved for low-cardinality grouping like `region` or `gpu_model`. |
| 6 | "Show me how to batch-write 1 million points efficiently in C#." | Write path, batching | Batches ≥ 1,000 points per flush, handles retriable vs non-retriable errors, uses `InfluxDB3.Client`. |
| 7 | "Write a SQL query that gives me the average temperature per region per hour for the last day." | Query, SQL idioms | Correct `DATE_BIN` or `time_bucket` usage for v3 SQL, `GROUP BY` on tags, sensible time filter. |
| 8 | "I have user input coming into a query — how do I parameterize it safely in Java?" | Query, security | Uses parameterized query API of `influxdb3-java`, never string-concatenates user input. |
| 9 | "I don't want to use the official client. Just give me curl examples for write and query against Cloud Dedicated." | HTTP fallback, Cloud Dedicated | Uses raw `/api/v3/write_lp` (or correct flavor endpoint) and `/api/v3/query_sql`, env vars for host and token. |
| 10 | "I think I'm hitting a 401 — help me check my auth setup." | Out-of-scope troubleshooting | Defers politely: explains this skill covers connect/write/query/schema; suggests checking env vars and that troubleshooting is a future addition. |
| 11 | "Migrate this v2 Python code to v3." | Out-of-scope migration | Defers politely; does not pretend to be a migration helper. |
| 12 | "How do I tell which flavor I'm connected to from my code?" | Flavor detection | Produces a `/ping`-based snippet matching the logic from `references/flavor-detection.md`. |

## How to run

For each prompt:

1. Start a fresh Claude Code session in a clean directory.
2. Paste the prompt verbatim.
3. Observe: did the skill activate (Claude should reference InfluxDB 3 specifically)?
4. Observe: does the generated code match the pass criteria above?
5. If a code answer was generated, copy it into a file, set the relevant env vars, and run it against a live InfluxDB 3 instance. It must produce the expected output.
6. Record pass/fail in `evals/results/smoke-<date>.md`.

## Hard-block cases

These prompts must NEVER produce the wrong output. If they do, **block release**:

- Any prompt where Claude inlines a real-looking token in generated code.
- Any prompt where Claude generates `.env` content and forgets to add `.env` to `.gitignore`.
- Prompt 10 or 11: Claude must defer, not invent a v2-migration or troubleshooting answer.
````

- [ ] **Step 2: Verify file**

```bash
ls -la evals/smoke-prompts.md
wc -l evals/smoke-prompts.md
```

Expected: file exists, ≥ 50 lines.

- [ ] **Step 3: Commit**

```bash
git add evals/smoke-prompts.md
git commit -m "test: add smoke-prompt list (v1 test spec)"
```

---

### Task 3: Minimal `SKILL.md` so the plugin loads

The full router is built in Task 18 once all destinations exist. This minimal version exists only to make the plugin loadable in Claude Code so we can verify triggering as we add content.

**Files:**
- Create: `skills/influxdb3/SKILL.md`

- [ ] **Step 1: Write minimal SKILL.md**

```bash
mkdir -p skills/influxdb3
```

````markdown
---
name: influxdb3
description: Use when the developer is writing or modifying code that connects
  to, reads from, writes to, or designs schemas for InfluxDB 3 (Core, Enterprise,
  Cloud Serverless, or Cloud Dedicated). Triggers on imports of any official
  InfluxDB 3 client (influxdb3-python, @influxdata/influxdb3-client,
  influxdb3-go, influxdb3-java, InfluxDB3.Client), references to line protocol,
  v3 SQL queries, or .env keys like INFLUXDB_HOST / INFLUXDB_TOKEN /
  INFLUXDB_DATABASE.
version: 0.1.0
last_verified: 2026-04-29
verified_against:
  influxdb3_core: "3.x"
  influxdb3_enterprise: "3.x"
  influxdb3_python: "0.x"
  influxdb3_javascript: "0.x"
  influxdb3_go: "0.x"
  influxdb3_java: "0.x"
  influxdb3_csharp: "0.x"
---

# InfluxDB 3 Skill (v0.1.0 — under construction)

This skill is being built. Full content arrives in Task 18 of the implementation plan.

For now, when this skill triggers, tell the user:

> "The InfluxDB 3 skill is currently in development. The full skill (connect/auth, write, query, schema design) will arrive in v0.1.0. For now, point the user at the official InfluxData docs at https://docs.influxdata.com/influxdb3/."
````

- [ ] **Step 2: Pin actual client library versions**

Open the InfluxData GitHub orgs and the npm/pip/Maven/NuGet pages and look up the current latest versions of each first-class client. Replace `"0.x"` in `verified_against:` with the actual current minor version, e.g., `"0.7"`, `"0.13"`, etc. If a client has not yet hit a stable v1, leave it on the current `0.x` series — but write a real number.

```bash
# Use these to find the canonical homes:
# python:     https://github.com/InfluxCommunity/influxdb3-python
# javascript: https://github.com/InfluxCommunity/influxdb3-js
# go:         https://github.com/InfluxCommunity/influxdb3-go
# java:       https://github.com/InfluxCommunity/influxdb3-java
# csharp:     https://github.com/InfluxCommunity/influxdb3-csharp
```

If any of the above repos has moved or renamed (the plan was written 2026-04-29), update the URL in `references/doc-urls.md` (Task 5) and confirm before pinning.

- [ ] **Step 3: Commit**

```bash
git add skills/influxdb3/SKILL.md
git commit -m "feat: add minimal SKILL.md so plugin loads"
```

---

### Task 4: Verify the plugin loads in Claude Code

This is the gate before any content work — if Claude Code doesn't see the plugin, nothing else matters.

- [ ] **Step 1: Restart Claude Code** so plugins reload

In your terminal, exit any open Claude Code sessions and start a fresh one in any directory other than the plugin repo.

- [ ] **Step 2: Confirm the plugin is recognized**

In the fresh session, run:

```
/plugin list
```

Expected: `claude-influxdb3` appears in the list with version `0.1.0`.

- [ ] **Step 3: Confirm the skill triggers**

In the same fresh session, paste:

```
I'm about to write some Python code that imports influxdb3-python and writes line protocol to InfluxDB 3 Core. Are you ready to help?
```

Expected: Claude's response references the placeholder text from the minimal SKILL.md ("InfluxDB 3 skill is currently in development"). This proves the skill loaded and triggered on the description-field signals.

- [ ] **Step 4: If the skill does NOT trigger**

Diagnose in this order:

1. Symlink: `ls -la ~/.claude/plugins/claude-influxdb3` — should resolve to `~/Projects/claude-influxdb3`.
2. Plugin manifest: `cat ~/.claude/plugins/claude-influxdb3/.claude-plugin/plugin.json` — `name`, `version`, and the `skills` array must be present.
3. Skill frontmatter: `head -20 ~/.claude/plugins/claude-influxdb3/skills/influxdb3/SKILL.md` — `name:` and `description:` must be present and well-formed YAML.

Fix and retry from Step 1.

- [ ] **Step 5: Commit a no-op verification note** (so the verification is recorded in git)

```bash
mkdir -p evals/results
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ): plugin load verified, minimal SKILL.md triggers on import-signal prompt" > evals/results/plugin-load-verification.txt
git add evals/results/plugin-load-verification.txt
git commit -m "test: verify plugin loads and minimal skill triggers"
```

---

## Phase 2: Foundation references

### Task 5: `references/doc-urls.md` — curated WebFetch URL list

Built first because every other reference will cite specific URLs from this file as the "go fetch fresh content" source.

**Files:**
- Create: `skills/influxdb3/references/doc-urls.md`

- [ ] **Step 1: Verify the URLs are reachable** (do this before writing the file so we don't ship dead links)

```bash
curl -sI https://docs.influxdata.com/influxdb3/core/ | head -1
curl -sI https://docs.influxdata.com/influxdb3/enterprise/ | head -1
curl -sI https://docs.influxdata.com/influxdb3/cloud-serverless/ | head -1
curl -sI https://docs.influxdata.com/influxdb3/cloud-dedicated/ | head -1
curl -sI https://github.com/InfluxCommunity/influxdb3-python | head -1
curl -sI https://github.com/InfluxCommunity/influxdb3-js | head -1
curl -sI https://github.com/InfluxCommunity/influxdb3-go | head -1
curl -sI https://github.com/InfluxCommunity/influxdb3-java | head -1
curl -sI https://github.com/InfluxCommunity/influxdb3-csharp | head -1
```

Expected: every response is `HTTP/2 200` or a 301/302 redirect to a 200. If any returns 404, ask the maintainer (Gary) for the correct URL before continuing.

- [ ] **Step 2: Write the file**

```bash
mkdir -p skills/influxdb3/references
```

````markdown
# Curated Documentation URLs

When the skill content does not cover a developer's question — or when the answer might be version-sensitive — Claude is allowed to WebFetch from this list. **Do not invent URLs that aren't on this list.** If you need a doc that's not here, ask the developer for the URL or note that the answer requires fresh research.

## InfluxDB 3 product docs (per flavor)

| Flavor | URL | When to fetch |
|---|---|---|
| Core | https://docs.influxdata.com/influxdb3/core/ | Default for self-hosted single-node setups; Core-specific config and admin |
| Enterprise | https://docs.influxdata.com/influxdb3/enterprise/ | Multi-node, replication, RBAC |
| Cloud Serverless | https://docs.influxdata.com/influxdb3/cloud-serverless/ | Cloud-Serverless–specific endpoints, auth, write path quirks |
| Cloud Dedicated | https://docs.influxdata.com/influxdb3/cloud-dedicated/ | Dedicated cluster setup, custom hosts |

## Spec-level references

| Topic | URL | When to fetch |
|---|---|---|
| Line protocol | https://docs.influxdata.com/influxdb3/core/reference/syntax/line-protocol/ | Edge cases on quoting, escaping, type coercion |
| SQL reference | https://docs.influxdata.com/influxdb3/core/reference/sql/ | v3 SQL syntax details and supported functions |
| InfluxQL reference | https://docs.influxdata.com/influxdb3/core/reference/influxql/ | Only when the user explicitly needs v1/v2 compatibility |
| HTTP API (`/api/v3/*`) | https://docs.influxdata.com/influxdb3/core/reference/api/ | Endpoint paths, request/response shapes |
| `/ping` endpoint | https://docs.influxdata.com/influxdb3/core/reference/api/#ping | Flavor detection details |

## Official client libraries (GitHub)

| Language | URL | When to fetch |
|---|---|---|
| Python | https://github.com/InfluxCommunity/influxdb3-python | API surface, `Point`, batching options, current release notes |
| JavaScript / TypeScript | https://github.com/InfluxCommunity/influxdb3-js | Same |
| Go | https://github.com/InfluxCommunity/influxdb3-go | Same |
| Java | https://github.com/InfluxCommunity/influxdb3-java | Same |
| C# | https://github.com/InfluxCommunity/influxdb3-csharp | Same |

## Flavor-detection reference

| Topic | URL | When to fetch |
|---|---|---|
| `influxdb3_ui` (Explorer) source | https://github.com/influxdata/influxdb3_ui | Source-of-truth for `/ping`-based flavor detection patterns |

## Last verified

This URL list was last verified on **2026-04-29**. If you find a broken link, log it in `evals/results/` and update this file as part of the next quarterly refresh.
````

- [ ] **Step 3: Commit**

```bash
git add skills/influxdb3/references/doc-urls.md
git commit -m "docs: add curated doc URLs reference"
```

---

### Task 6: `references/flavors.md` — Core/Enterprise/Cloud comparison

**Files:**
- Create: `skills/influxdb3/references/flavors.md`

- [ ] **Step 1: Read the spec section** that defines the comparison columns

Read §4 of the spec (`docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md`), `references/flavors.md` block. The required dimensions are: default port, host pattern, token type, write endpoint path, query endpoint, SQL support, InfluxQL support, database creation method, multi-database support, notable limits.

- [ ] **Step 2: Verify each cell against current docs**

For each of the four flavors, fetch the corresponding URL from `references/doc-urls.md` and confirm:
- Default port (Core: `8181`; others: configured / 443 over TLS).
- Host pattern (Core/Enterprise: configurable; Cloud Serverless: `https://<region>-<cluster>.cloud2.influxdata.com`; Cloud Dedicated: customer-specific hostname).
- Write endpoint: confirm `/api/v3/write_lp` for Core/Enterprise, `/api/v2/write` for Cloud Serverless back-compat, and the v3 endpoint for Cloud Dedicated.
- Query endpoint: confirm `/api/v3/query_sql` and `/api/v3/query_influxql` everywhere v3-native; flag exceptions.
- SQL: yes everywhere.
- InfluxQL: confirm support per flavor (typically yes everywhere for read; some flavors may differ on write).
- Database creation: HTTP API on Core/Enterprise; UI/CLI for Cloud.
- Multi-database support and limits: per-flavor.

If any cell is uncertain, leave a clear comment `# UNCONFIRMED — check before merge` and surface it for review rather than guessing.

- [ ] **Step 3: Write the file**

````markdown
# InfluxDB 3 Flavors

InfluxDB 3 ships in four flavors. Most code is portable across flavors when host and token are env-driven; this reference exists for the cases where they actually differ.

## Comparison table

| Dimension | Core | Enterprise | Cloud Serverless | Cloud Dedicated |
|---|---|---|---|---|
| **Default port** | `8181` | `8181` (per node) | 443 (TLS) | 443 (TLS) |
| **Host pattern** | configurable, often `localhost:8181` | configurable cluster | `https://<region>-<id>.cloud2.influxdata.com` | customer-specific hostname |
| **Token type** | database / admin token | database / admin token (with RBAC) | management + database tokens | management + database tokens |
| **Write endpoint** | `POST /api/v3/write_lp` | `POST /api/v3/write_lp` | `POST /api/v2/write` (back-compat) | `POST /api/v3/write_lp` |
| **Query (SQL)** | `POST /api/v3/query_sql` | `POST /api/v3/query_sql` | `POST /api/v3/query_sql` | `POST /api/v3/query_sql` |
| **Query (InfluxQL)** | `POST /api/v3/query_influxql` | `POST /api/v3/query_influxql` | `POST /api/v3/query_influxql` | `POST /api/v3/query_influxql` |
| **Multi-database** | yes | yes | yes (per bucket) | yes |
| **Database creation** | HTTP API or CLI | HTTP API or CLI | UI / API (cloud-managed) | UI / API (cloud-managed) |

## Notable per-flavor gotchas

### Core
Single-node, open source. No RBAC. Tokens are scoped per database. Default object-store is local disk; `--object-store=memory` is fine for testing only.

### Enterprise
Multi-node cluster. RBAC and replication are first-class. Same v3 HTTP API as Core; the differences are operational (cluster, observability) rather than client-facing.

### Cloud Serverless
The write path is the v2-compatible `/api/v2/write` endpoint for back-compat with v2 tooling, but **queries are v3 SQL** via `/api/v3/query_sql`. Generated code that targets Cloud Serverless should use the v2 write path; the v3 SQL query path is unchanged.

### Cloud Dedicated
Same v3 API surface as Core/Enterprise, but the host is customer-specific and tokens are managed via the Cloud Dedicated console. Auth is otherwise identical.

## When to ask the developer

Ask explicitly which flavor they're targeting only if `references/flavor-detection.md`'s `/ping` probe returns ambiguous output **and** the answer would change the generated code (e.g., write endpoint differs). For most read code, you can generate flavor-agnostic code via env vars and skip the question.
````

- [ ] **Step 4: Commit**

```bash
git add skills/influxdb3/references/flavors.md
git commit -m "docs: add flavors comparison reference"
```

---

### Task 7: `references/flavor-detection.md` — `/ping` probe ported from `influxdb3_ui`

**Files:**
- Create: `skills/influxdb3/references/flavor-detection.md`

- [ ] **Step 1: Pull the actual matching patterns from `influxdb3_ui`**

Browse the `influxdb3_ui` repo's source (https://github.com/influxdata/influxdb3_ui) and find the file(s) where it does flavor / version detection from `/ping`. Search the repo for `/ping`, `version`, `build`, or `flavor`. Look for the regex / string matches it uses.

```bash
# A useful starting search if you have the repo cloned locally:
git clone https://github.com/influxdata/influxdb3_ui /tmp/influxdb3_ui
cd /tmp/influxdb3_ui
grep -rni '/ping\|flavor\|build\|version' --include='*.ts' --include='*.tsx' --include='*.js' .
```

Capture the actual patterns. **Do not invent them.** If the repo's detection logic has moved or no longer exists in this form, surface it for the maintainer (Gary) to point you at the right place — do not guess.

- [ ] **Step 2: Write the reference**

````markdown
# Flavor Detection via `/ping`

Most code can stay flavor-agnostic by reading host and token from env vars. When the generated code genuinely needs flavor-specific logic (different write endpoints, for example), use the `/ping` probe to detect the flavor.

This logic is ported from the `influxdb3_ui` (Explorer) project. Source: https://github.com/influxdata/influxdb3_ui.

## Decision flow

1. `GET <host>/ping` with the developer's `INFLUXDB_TOKEN` in the `Authorization: Bearer …` header.
2. Inspect the response headers and body for the published version-string patterns (see "Patterns" below).
3. Match in priority order: Cloud Dedicated → Cloud Serverless → Enterprise → Core.
4. If `/ping` is unreachable (connection refused, DNS error, 5xx) **or** the response doesn't match any pattern, fall back to asking the developer.

## Patterns

> **Implementation note:** fill these in with the actual patterns from `influxdb3_ui`. Each pattern is a (header_or_body, regex_or_substring) pair that uniquely identifies a flavor. Do not invent — pull from source.

| Flavor | Match against | Pattern |
|---|---|---|
| Cloud Dedicated | (TBD — pull from `influxdb3_ui`) | (TBD) |
| Cloud Serverless | (TBD) | (TBD) |
| Enterprise | (TBD) | (TBD) |
| Core | (TBD — usually the default if `/ping` succeeds with no other distinguishing markers) | (TBD) |

## Reference snippets

### Python

```python
import os
import re
import requests

FLAVOR_PATTERNS = [
    # Order matters: more specific first.
    # ("Cloud Dedicated", r"..."),
    # ("Cloud Serverless", r"..."),
    # ("Enterprise", r"..."),
    # ("Core", r"..."),  # default match
]

def detect_flavor(host: str, token: str) -> str | None:
    try:
        r = requests.get(
            f"{host.rstrip('/')}/ping",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    haystack = " ".join([r.text, *(f"{k}: {v}" for k, v in r.headers.items())])
    for flavor, pattern in FLAVOR_PATTERNS:
        if re.search(pattern, haystack, re.IGNORECASE):
            return flavor
    return None
```

### JavaScript (Node / fetch)

```javascript
const FLAVOR_PATTERNS = [
  // ['Cloud Dedicated', /.../i],
  // ['Cloud Serverless', /.../i],
  // ['Enterprise', /.../i],
  // ['Core', /.../i],
];

export async function detectFlavor(host, token) {
  let res;
  try {
    res = await fetch(`${host.replace(/\/$/, '')}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.text();
  const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
  const haystack = `${body}\n${headers}`;
  for (const [flavor, pattern] of FLAVOR_PATTERNS) {
    if (pattern.test(haystack)) return flavor;
  }
  return null;
}
```

## Fallback to asking

When `detect_flavor` / `detectFlavor` returns `null`, prompt the developer:

> "I couldn't detect your InfluxDB 3 flavor from `/ping`. Which one are you targeting? Core, Enterprise, Cloud Serverless, or Cloud Dedicated?"

Record the answer and continue.
````

- [ ] **Step 3: Verify the snippets parse**

```bash
python3 -c "import ast; ast.parse(open('skills/influxdb3/references/flavor-detection.md').read().split('```python')[1].split('```')[0])"
node --check <(echo "$(awk '/```javascript/,/```/' skills/influxdb3/references/flavor-detection.md | sed '1d;$d')") 2>&1 | head
```

Expected: no syntax errors. (The Node check is best-effort; if it can't parse the JSDoc-style ESM, that's fine — the goal is to catch obvious typos.)

- [ ] **Step 4: Commit**

```bash
git add skills/influxdb3/references/flavor-detection.md
git commit -m "docs: add /ping flavor-detection reference (patterns TBD from influxdb3_ui)"
```

> **Follow-up:** the `(TBD)` cells in the table and the `FLAVOR_PATTERNS` arrays are placeholders **only because** they require pulling from `influxdb3_ui` source. Before this skill is shipped (Task 25), they MUST be replaced with the real patterns. This is captured in §7 Open Items of the spec.

---

### Task 8: `references/connecting.md` — auth rules and `.env` patterns

**Files:**
- Create: `skills/influxdb3/references/connecting.md`

- [ ] **Step 1: Write the reference**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add skills/influxdb3/references/connecting.md
git commit -m "docs: add connecting & auth reference"
```

---

## Phase 3: Language clients & runnable examples

> **Convention for this phase:** every language gets a `references/clients/<lang>.md` plus `examples/<lang>/hello.<ext>`, `examples/<lang>/schema-example.<ext>`, and `examples/<lang>/.env.example`. The HTTP one is the exception — see Task 9.
>
> **Verification for every example script:** export `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in your shell to point at a live test instance, run the script, and confirm it (a) connects, (b) writes 10 points, (c) reads them back, (d) prints recognisable output. If any step fails, the example is broken — not the runtime.

### Task 9: HTTP fallback (curl) — `references/clients/http.md` and `examples/http/`

This is built first in the language phase because every other reference can point at it as the "if you don't want a client" fallback.

**Files:**
- Create: `skills/influxdb3/references/clients/http.md`
- Create: `skills/influxdb3/examples/http/hello.sh`
- Create: `skills/influxdb3/examples/http/.env.example`

- [ ] **Step 1: Write `references/clients/http.md`**

```bash
mkdir -p skills/influxdb3/references/clients skills/influxdb3/examples/http
```

````markdown
# Raw HTTP / curl

For any language without a first-class client, or when a developer explicitly wants to skip the client library, use the v3 HTTP API directly.

## Endpoints

| Action | Method | Path | Notes |
|---|---|---|---|
| Health probe / flavor detection | `GET` | `/ping` | See `references/flavor-detection.md` |
| Write line protocol | `POST` | `/api/v3/write_lp?db=$INFLUXDB_DATABASE` | Body is line protocol; one line per point |
| Write line protocol (Cloud Serverless) | `POST` | `/api/v2/write?org=$INFLUXDB_ORG&bucket=$INFLUXDB_DATABASE` | v2-compat write path |
| Query (SQL) | `POST` | `/api/v3/query_sql` | JSON body: `{"db": "...", "q": "..."}` |
| Query (InfluxQL) | `POST` | `/api/v3/query_influxql` | Same shape; legacy compat only |

## Auth

Always: `Authorization: Bearer $INFLUXDB_TOKEN`. Never put the token in the URL.

## Write — minimal example

```bash
curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "sensor,host=server01,region=us-west temperature=72.4,humidity=45.1 $(date +%s)"
```

Expected: HTTP 204 (no content) on success.

## Query — minimal example

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\", \"q\": \"SELECT * FROM sensor ORDER BY time DESC LIMIT 5\"}"
```

Expected: JSON array of rows.

## Error handling

| Status | Meaning | Retriable? |
|---|---|---|
| 200 / 204 | Success | n/a |
| 400 | Bad request — line protocol parse error or invalid SQL | **No** — fix and retry, don't retry blindly |
| 401 | Auth failed — bad/missing token | **No** — fix env var |
| 404 | Database not found | **No** |
| 429 | Rate limited | **Yes** — exponential backoff |
| 5xx | Server side | **Yes** — backoff + retry |

## Parameterizing user input

The v3 SQL query endpoint accepts an optional `params` object — use it. Never string-concatenate user input into the `q` field.

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"db\": \"$INFLUXDB_DATABASE\",
    \"q\": \"SELECT * FROM sensor WHERE host = \$1 LIMIT 10\",
    \"params\": [\"server01\"]
  }"
```

## Where to fetch more

`references/doc-urls.md` → "HTTP API (`/api/v3/*`)".
````

- [ ] **Step 2: Write `examples/http/.env.example`**

```bash
# .env.example for InfluxDB 3 raw-HTTP example
# Copy to .env and fill in. .env is gitignored.

INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
# INFLUXDB_ORG only needed for Cloud Serverless writes:
# INFLUXDB_ORG=your-org-id
```

- [ ] **Step 3: Write `examples/http/hello.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Hello-world for InfluxDB 3 over raw HTTP / curl.
# Connects, writes 10 points, queries them back.

# Load .env from the script's directory if present.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$script_dir/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$script_dir/.env"
  set +a
fi

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required}"
: "${INFLUXDB_DATABASE:?INFLUXDB_DATABASE is required}"

echo "==> Writing 10 points to $INFLUXDB_DATABASE on $INFLUXDB_HOST"

now=$(date +%s)
body=""
for i in $(seq 1 10); do
  ts=$((now - (10 - i) * 60))
  body+="sensor,host=server01,region=us-west temperature=$((70 + RANDOM % 5)).0,humidity=$((40 + RANDOM % 10)).0 $ts"$'\n'
done

curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "$body"

echo "==> Querying last 10 rows back"

curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\", \"q\": \"SELECT * FROM sensor ORDER BY time DESC LIMIT 10\"}"
echo
echo "==> Done"
```

```bash
chmod +x skills/influxdb3/examples/http/hello.sh
```

- [ ] **Step 4: Run the example against a live instance to verify**

```bash
cd skills/influxdb3/examples/http
cp .env.example .env
# Edit .env with real values
./hello.sh
```

Expected:
- `==> Writing 10 points to hello_db on http://...`
- (no error)
- `==> Querying last 10 rows back`
- A JSON array containing 10 rows of sensor data
- `==> Done`

If 401: fix the token. If 404: create the database first via the InfluxDB CLI / UI. If connection refused: confirm the server is running.

- [ ] **Step 5: Commit**

```bash
git add skills/influxdb3/references/clients/http.md \
        skills/influxdb3/examples/http/hello.sh \
        skills/influxdb3/examples/http/.env.example
git commit -m "feat: add raw-HTTP client reference and hello example"
```

---

### Task 10: Python — `references/clients/python.md` + `examples/python/`

**Files:**
- Create: `skills/influxdb3/references/clients/python.md`
- Create: `skills/influxdb3/examples/python/hello.py`
- Create: `skills/influxdb3/examples/python/schema-example.py`
- Create: `skills/influxdb3/examples/python/.env.example`

- [ ] **Step 1: Write `references/clients/python.md`**

```bash
mkdir -p skills/influxdb3/examples/python
```

````markdown
# Python Client (`influxdb3-python`)

## Install

```bash
pip install influxdb3-python python-dotenv
```

## Construct the client

```python
from dotenv import load_dotenv
import os
from influxdb_client_3 import InfluxDBClient3

load_dotenv()
client = InfluxDBClient3(
    host=os.environ["INFLUXDB_HOST"],
    token=os.environ["INFLUXDB_TOKEN"],
    database=os.environ["INFLUXDB_DATABASE"],
)
```

## Write a batch (line protocol)

```python
from influxdb_client_3 import Point

points = [
    Point("sensor")
        .tag("host", "server01")
        .tag("region", "us-west")
        .field("temperature", 72.4)
        .field("humidity", 45.1)
    for _ in range(1000)
]
client.write(record=points)
```

For high throughput, use the client's batching options (see https://github.com/InfluxCommunity/influxdb3-python). Default rule: batch ≥ 1,000 points or flush every 1 second.

## Parameterized SQL query

```python
result = client.query(
    query="SELECT * FROM sensor WHERE host = $host LIMIT 10",
    parameters={"host": user_supplied_host},  # never f-string user input
)
for row in result:
    print(row)
```

## Error handling

```python
from influxdb_client_3 import InfluxDBError

try:
    client.write(record=points)
except InfluxDBError as e:
    if e.response and e.response.status in (429, 500, 502, 503, 504):
        # retriable — back off and retry
        ...
    else:
        # 400/401/404 — fix and don't retry blindly
        raise
```

## Where to fetch more

`references/doc-urls.md` → "Python".
````

- [ ] **Step 2: Write `examples/python/.env.example`**

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
```

- [ ] **Step 3: Write `examples/python/hello.py`**

```python
"""Hello-world for InfluxDB 3 in Python.

Connects, writes 10 points, queries them back, prints results.
Reads connection info from .env (or the environment).
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from influxdb_client_3 import InfluxDBClient3, Point


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]
    database = os.environ["INFLUXDB_DATABASE"]

    client = InfluxDBClient3(host=host, token=token, database=database)

    now = int(time.time())
    points = [
        Point("sensor")
        .tag("host", "server01")
        .tag("region", "us-west")
        .field("temperature", 70.0 + i * 0.3)
        .field("humidity", 40.0 + i * 0.5)
        .time(now - (10 - i) * 60, write_precision="s")
        for i in range(10)
    ]
    print(f"==> Writing {len(points)} points to {database} on {host}")
    client.write(record=points)

    print("==> Querying last 10 rows back")
    rows = client.query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10")
    for row in rows:
        print(row)

    print("==> Done")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Write `examples/python/schema-example.py`**

```python
"""Schema example for InfluxDB 3 in Python.

Demonstrates a sensible measurement design:
  measurement: sensor
  tags:        host (low-cardinality), region (low-cardinality)
  fields:      temperature, humidity, gpu_id (high-cardinality identity)
  timestamp:   per-write

Then runs a representative aggregation query.
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from influxdb_client_3 import InfluxDBClient3, Point


def main() -> None:
    load_dotenv()
    client = InfluxDBClient3(
        host=os.environ["INFLUXDB_HOST"],
        token=os.environ["INFLUXDB_TOKEN"],
        database=os.environ["INFLUXDB_DATABASE"],
    )

    # Write 60 points across two regions and three hosts.
    now = int(time.time())
    points = []
    for minute in range(60):
        ts = now - (60 - minute) * 60
        for region in ("us-west", "us-east"):
            for host_idx in range(3):
                # gpu_id is HIGH cardinality (unique per host) → field, not tag.
                points.append(
                    Point("sensor")
                    .tag("host", f"server{host_idx:02d}")
                    .tag("region", region)
                    .field("temperature", 70.0 + (minute % 5))
                    .field("humidity", 40.0 + (host_idx % 3))
                    .field("gpu_id", f"gpu-{region}-{host_idx}-{minute}")
                    .time(ts, write_precision="s")
                )
    print(f"==> Writing {len(points)} points")
    client.write(record=points)

    print("==> Avg temperature per region per 5-min bucket, last hour")
    sql = """
        SELECT
          region,
          DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
          AVG(temperature) AS avg_temp
        FROM sensor
        WHERE time >= now() - INTERVAL '1 hour'
        GROUP BY region, bucket
        ORDER BY bucket DESC, region
    """
    for row in client.query(sql):
        print(row)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run both examples to verify**

```bash
cd skills/influxdb3/examples/python
cp .env.example .env  # then edit
python3 -m venv .venv
source .venv/bin/activate
pip install influxdb3-python python-dotenv
python hello.py
python schema-example.py
deactivate
rm -rf .venv
```

Expected: `hello.py` prints 10 rows; `schema-example.py` prints a non-empty per-region/per-bucket aggregation. Any error → debug the script before continuing.

- [ ] **Step 6: Commit**

```bash
git add skills/influxdb3/references/clients/python.md \
        skills/influxdb3/examples/python/hello.py \
        skills/influxdb3/examples/python/schema-example.py \
        skills/influxdb3/examples/python/.env.example
git commit -m "feat: add Python client reference and runnable examples"
```

---

### Task 11: JavaScript / TypeScript — `references/clients/javascript.md` + `examples/javascript/`

**Files:**
- Create: `skills/influxdb3/references/clients/javascript.md`
- Create: `skills/influxdb3/examples/javascript/hello.js`
- Create: `skills/influxdb3/examples/javascript/schema-example.js`
- Create: `skills/influxdb3/examples/javascript/.env.example`
- Create: `skills/influxdb3/examples/javascript/package.json`

- [ ] **Step 1: Write `references/clients/javascript.md`**

```bash
mkdir -p skills/influxdb3/examples/javascript
```

````markdown
# JavaScript / TypeScript Client (`@influxdata/influxdb3-client`)

## Install

```bash
npm install @influxdata/influxdb3-client dotenv
```

## Construct the client

```javascript
import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST,
  token: process.env.INFLUXDB_TOKEN,
  database: process.env.INFLUXDB_DATABASE,
});
```

## Write a batch

```javascript
const points = Array.from({ length: 1000 }, () =>
  Point.measurement('sensor')
    .setTag('host', 'server01')
    .setTag('region', 'us-west')
    .setFloatField('temperature', 72.4)
    .setFloatField('humidity', 45.1)
);
await client.write(points);
```

Default rule: batch ≥ 1,000 points or flush every 1 second.

## Parameterized SQL query

```javascript
const rows = client.query(
  'SELECT * FROM sensor WHERE host = $host LIMIT 10',
  process.env.INFLUXDB_DATABASE,
  { type: 'sql', params: { host: userSuppliedHost } }
);
for await (const row of rows) {
  console.log(row);
}
```

## Error handling

Catch and inspect `error.statusCode`. Treat 429 / 5xx as retriable; 400 / 401 / 404 as non-retriable.

## Where to fetch more

`references/doc-urls.md` → "JavaScript / TypeScript".
````

- [ ] **Step 2: Write `examples/javascript/.env.example`**

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
```

- [ ] **Step 3: Write `examples/javascript/package.json`**

```json
{
  "name": "influxdb3-hello",
  "private": true,
  "type": "module",
  "scripts": {
    "hello": "node hello.js",
    "schema": "node schema-example.js"
  },
  "dependencies": {
    "@influxdata/influxdb3-client": "^0.13.0",
    "dotenv": "^16.4.0"
  }
}
```

> **Implementation note:** the version pins above are placeholders. Pin to the latest stable when running `npm install` (Step 6).

- [ ] **Step 4: Write `examples/javascript/hello.js`**

```javascript
import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const host = process.env.INFLUXDB_HOST;
const token = process.env.INFLUXDB_TOKEN;
const database = process.env.INFLUXDB_DATABASE;

if (!host || !token || !database) {
  throw new Error('INFLUXDB_HOST, INFLUXDB_TOKEN, and INFLUXDB_DATABASE are required');
}

const client = new InfluxDBClient({ host, token, database });

const now = Date.now();
const points = Array.from({ length: 10 }, (_, i) =>
  Point.measurement('sensor')
    .setTag('host', 'server01')
    .setTag('region', 'us-west')
    .setFloatField('temperature', 70 + i * 0.3)
    .setFloatField('humidity', 40 + i * 0.5)
    .setTimestamp(new Date(now - (10 - i) * 60_000))
);

console.log(`==> Writing ${points.length} points to ${database} on ${host}`);
await client.write(points);

console.log('==> Querying last 10 rows back');
const rows = client.query('SELECT * FROM sensor ORDER BY time DESC LIMIT 10', database, { type: 'sql' });
for await (const row of rows) {
  console.log(row);
}

await client.close();
console.log('==> Done');
```

- [ ] **Step 5: Write `examples/javascript/schema-example.js`**

```javascript
import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST,
  token: process.env.INFLUXDB_TOKEN,
  database: process.env.INFLUXDB_DATABASE,
});

const now = Date.now();
const points = [];
for (let minute = 0; minute < 60; minute++) {
  const ts = new Date(now - (60 - minute) * 60_000);
  for (const region of ['us-west', 'us-east']) {
    for (let hostIdx = 0; hostIdx < 3; hostIdx++) {
      // gpu_id is HIGH cardinality (unique per host-minute) → field, not tag.
      points.push(
        Point.measurement('sensor')
          .setTag('host', `server${String(hostIdx).padStart(2, '0')}`)
          .setTag('region', region)
          .setFloatField('temperature', 70 + (minute % 5))
          .setFloatField('humidity', 40 + (hostIdx % 3))
          .setStringField('gpu_id', `gpu-${region}-${hostIdx}-${minute}`)
          .setTimestamp(ts)
      );
    }
  }
}
console.log(`==> Writing ${points.length} points`);
await client.write(points);

console.log('==> Avg temperature per region per 5-min bucket, last hour');
const sql = `
  SELECT
    region,
    DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
    AVG(temperature) AS avg_temp
  FROM sensor
  WHERE time >= now() - INTERVAL '1 hour'
  GROUP BY region, bucket
  ORDER BY bucket DESC, region
`;
const rows = client.query(sql, process.env.INFLUXDB_DATABASE, { type: 'sql' });
for await (const row of rows) {
  console.log(row);
}
await client.close();
```

- [ ] **Step 6: Run both examples to verify**

```bash
cd skills/influxdb3/examples/javascript
cp .env.example .env  # edit it
npm install
npm run hello
npm run schema
```

Expected: same as Python — 10 rows back from `hello`, non-empty aggregation from `schema`.

- [ ] **Step 7: Clean up node_modules before committing**

```bash
rm -rf skills/influxdb3/examples/javascript/node_modules \
       skills/influxdb3/examples/javascript/package-lock.json
```

(`node_modules/` is already in `.gitignore`. We don't commit `package-lock.json` either since the example is meant as a starting template.)

- [ ] **Step 8: Commit**

```bash
git add skills/influxdb3/references/clients/javascript.md \
        skills/influxdb3/examples/javascript/
git commit -m "feat: add JavaScript client reference and runnable examples"
```

---

### Task 12: Go — `references/clients/go.md` + `examples/go/`

**Files:**
- Create: `skills/influxdb3/references/clients/go.md`
- Create: `skills/influxdb3/examples/go/hello.go`
- Create: `skills/influxdb3/examples/go/schema_example.go`
- Create: `skills/influxdb3/examples/go/.env.example`
- Create: `skills/influxdb3/examples/go/go.mod`
- Create: `skills/influxdb3/examples/go/README.md`

- [ ] **Step 1: Write `references/clients/go.md`**

```bash
mkdir -p skills/influxdb3/examples/go
```

````markdown
# Go Client (`influxdb3-go`)

## Install

```bash
go get github.com/InfluxCommunity/influxdb3-go/influxdb3
go get github.com/joho/godotenv
```

## Construct the client

```go
import (
    "os"
    "github.com/InfluxCommunity/influxdb3-go/influxdb3"
    "github.com/joho/godotenv"
)

_ = godotenv.Load()
client, err := influxdb3.New(influxdb3.ClientConfig{
    Host:     os.Getenv("INFLUXDB_HOST"),
    Token:    os.Getenv("INFLUXDB_TOKEN"),
    Database: os.Getenv("INFLUXDB_DATABASE"),
})
```

## Write a batch

```go
points := make([]*influxdb3.Point, 0, 1000)
for i := 0; i < 1000; i++ {
    points = append(points,
        influxdb3.NewPointWithMeasurement("sensor").
            SetTag("host", "server01").
            SetTag("region", "us-west").
            SetField("temperature", 72.4).
            SetField("humidity", 45.1),
    )
}
if err := client.WritePoints(ctx, points); err != nil { ... }
```

## Parameterized SQL query

```go
iter, err := client.QueryWithParameters(ctx,
    "SELECT * FROM sensor WHERE host = $host LIMIT 10",
    influxdb3.QueryParameters{"host": userSuppliedHost},
)
```

## Error handling

Inspect the error type / wrapped HTTP status. 429/5xx → retriable; 400/401/404 → non-retriable.

## Where to fetch more

`references/doc-urls.md` → "Go".
````

- [ ] **Step 2: Write `examples/go/.env.example`**

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
```

- [ ] **Step 3: Write `examples/go/go.mod`**

```
module example.com/influxdb3-hello

go 1.22

require (
    github.com/InfluxCommunity/influxdb3-go v0.13.0
    github.com/joho/godotenv v1.5.1
)
```

> **Implementation note:** version pins are placeholders. Run `go get -u` and let `go mod tidy` settle them.

- [ ] **Step 4: Write `examples/go/hello.go`**

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/InfluxCommunity/influxdb3-go/influxdb3"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	host := mustEnv("INFLUXDB_HOST")
	token := mustEnv("INFLUXDB_TOKEN")
	database := mustEnv("INFLUXDB_DATABASE")

	client, err := influxdb3.New(influxdb3.ClientConfig{
		Host:     host,
		Token:    token,
		Database: database,
	})
	if err != nil {
		log.Fatalf("client init: %v", err)
	}
	defer client.Close()

	ctx := context.Background()
	now := time.Now()

	points := make([]*influxdb3.Point, 0, 10)
	for i := 0; i < 10; i++ {
		ts := now.Add(time.Duration(-(10 - i)) * time.Minute)
		p := influxdb3.NewPointWithMeasurement("sensor").
			SetTag("host", "server01").
			SetTag("region", "us-west").
			SetField("temperature", 70.0+float64(i)*0.3).
			SetField("humidity", 40.0+float64(i)*0.5).
			SetTimestamp(ts)
		points = append(points, p)
	}

	fmt.Printf("==> Writing %d points to %s on %s\n", len(points), database, host)
	if err := client.WritePoints(ctx, points); err != nil {
		log.Fatalf("write: %v", err)
	}

	fmt.Println("==> Querying last 10 rows back")
	iter, err := client.Query(ctx, "SELECT * FROM sensor ORDER BY time DESC LIMIT 10")
	if err != nil {
		log.Fatalf("query: %v", err)
	}
	for iter.Next() {
		fmt.Println(iter.Value())
	}
	if err := iter.Err(); err != nil {
		log.Fatalf("iterate: %v", err)
	}
	fmt.Println("==> Done")
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing env var %s", k)
	}
	return v
}
```

- [ ] **Step 5: Write `examples/go/schema_example.go`**

```go
//go:build schema

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/InfluxCommunity/influxdb3-go/influxdb3"
	"github.com/joho/godotenv"
)

// Run with: go run -tags=schema ./schema_example.go
func main() {
	_ = godotenv.Load()
	client, err := influxdb3.New(influxdb3.ClientConfig{
		Host:     os.Getenv("INFLUXDB_HOST"),
		Token:    os.Getenv("INFLUXDB_TOKEN"),
		Database: os.Getenv("INFLUXDB_DATABASE"),
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()
	ctx := context.Background()

	now := time.Now()
	var points []*influxdb3.Point
	for minute := 0; minute < 60; minute++ {
		ts := now.Add(time.Duration(-(60 - minute)) * time.Minute)
		for _, region := range []string{"us-west", "us-east"} {
			for hostIdx := 0; hostIdx < 3; hostIdx++ {
				p := influxdb3.NewPointWithMeasurement("sensor").
					SetTag("host", fmt.Sprintf("server%02d", hostIdx)).
					SetTag("region", region).
					SetField("temperature", 70.0+float64(minute%5)).
					SetField("humidity", 40.0+float64(hostIdx%3)).
					// gpu_id is HIGH cardinality → field, not tag.
					SetField("gpu_id", fmt.Sprintf("gpu-%s-%d-%d", region, hostIdx, minute)).
					SetTimestamp(ts)
				points = append(points, p)
			}
		}
	}
	fmt.Printf("==> Writing %d points\n", len(points))
	if err := client.WritePoints(ctx, points); err != nil {
		log.Fatal(err)
	}

	fmt.Println("==> Avg temperature per region per 5-min bucket, last hour")
	sql := `
        SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket, AVG(temperature) AS avg_temp
        FROM sensor
        WHERE time >= now() - INTERVAL '1 hour'
        GROUP BY region, bucket
        ORDER BY bucket DESC, region`
	iter, err := client.Query(ctx, sql)
	if err != nil {
		log.Fatal(err)
	}
	for iter.Next() {
		fmt.Println(iter.Value())
	}
}
```

- [ ] **Step 6: Write `examples/go/README.md`**

```markdown
# Go example

Two entry points share `package main` via build tags so they don't collide:

- `go run hello.go` — connects, writes 10 points, queries them back.
- `go run -tags=schema schema_example.go` — schema-design demo.

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.
```

- [ ] **Step 7: Run both examples**

```bash
cd skills/influxdb3/examples/go
cp .env.example .env
go mod tidy
go run hello.go
go run -tags=schema schema_example.go
```

Expected: 10 rows from `hello.go`, non-empty aggregation from `schema_example.go`.

- [ ] **Step 8: Clean up build artifacts**

```bash
go clean
```

(`go.sum` IS committed — it pins the dep tree. `bin/` is gitignored.)

- [ ] **Step 9: Commit**

```bash
git add skills/influxdb3/references/clients/go.md \
        skills/influxdb3/examples/go/
git commit -m "feat: add Go client reference and runnable examples"
```

---

### Task 13: Java — `references/clients/java.md` + `examples/java/`

**Files:**
- Create: `skills/influxdb3/references/clients/java.md`
- Create: `skills/influxdb3/examples/java/Hello.java`
- Create: `skills/influxdb3/examples/java/SchemaExample.java`
- Create: `skills/influxdb3/examples/java/.env.example`
- Create: `skills/influxdb3/examples/java/pom.xml`
- Create: `skills/influxdb3/examples/java/README.md`

- [ ] **Step 1: Write `references/clients/java.md`**

```bash
mkdir -p skills/influxdb3/examples/java
```

````markdown
# Java Client (`influxdb3-java`)

## Maven dependency

```xml
<dependency>
  <groupId>com.influxdb</groupId>
  <artifactId>influxdb3-java</artifactId>
  <version>0.13.0</version>
</dependency>
<dependency>
  <groupId>io.github.cdimascio</groupId>
  <artifactId>dotenv-java</artifactId>
  <version>3.0.0</version>
</dependency>
```

> Pin to the latest stable. `references/doc-urls.md` → Java for the current release.

## Construct the client

```java
import com.influxdb.v3.client.InfluxDBClient;
import io.github.cdimascio.dotenv.Dotenv;

Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
InfluxDBClient client = InfluxDBClient.getInstance(
    dotenv.get("INFLUXDB_HOST"),
    dotenv.get("INFLUXDB_TOKEN").toCharArray(),
    dotenv.get("INFLUXDB_DATABASE")
);
```

## Write a batch

```java
import com.influxdb.v3.client.Point;

List<Point> points = new ArrayList<>();
for (int i = 0; i < 1000; i++) {
    points.add(Point.measurement("sensor")
        .setTag("host", "server01")
        .setTag("region", "us-west")
        .setFloatField("temperature", 72.4)
        .setFloatField("humidity", 45.1));
}
client.writePoints(points);
```

## Parameterized SQL query

```java
QueryOptions opts = new QueryOptions().withQueryType(QueryType.SQL)
    .withParameters(Map.of("host", userSuppliedHost));
try (Stream<Object[]> rows = client.query(
        "SELECT * FROM sensor WHERE host = $host LIMIT 10", opts)) {
    rows.forEach(r -> System.out.println(Arrays.toString(r)));
}
```

## Where to fetch more

`references/doc-urls.md` → "Java".
````

- [ ] **Step 2: Write `examples/java/.env.example`**

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
```

- [ ] **Step 3: Write `examples/java/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.influxdata.examples</groupId>
  <artifactId>influxdb3-hello</artifactId>
  <version>0.1.0</version>
  <packaging>jar</packaging>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>com.influxdb</groupId>
      <artifactId>influxdb3-java</artifactId>
      <version>0.13.0</version>
    </dependency>
    <dependency>
      <groupId>io.github.cdimascio</groupId>
      <artifactId>dotenv-java</artifactId>
      <version>3.0.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.1.0</version>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 4: Write `examples/java/Hello.java`**

```java
import com.influxdb.v3.client.InfluxDBClient;
import com.influxdb.v3.client.Point;
import io.github.cdimascio.dotenv.Dotenv;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.util.stream.Stream;

public class Hello {
    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        String host = require(dotenv, "INFLUXDB_HOST");
        String token = require(dotenv, "INFLUXDB_TOKEN");
        String database = require(dotenv, "INFLUXDB_DATABASE");

        try (InfluxDBClient client =
                 InfluxDBClient.getInstance(host, token.toCharArray(), database)) {

            Instant now = Instant.now();
            List<Point> points = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                points.add(Point.measurement("sensor")
                    .setTag("host", "server01")
                    .setTag("region", "us-west")
                    .setFloatField("temperature", 70.0 + i * 0.3)
                    .setFloatField("humidity", 40.0 + i * 0.5)
                    .setTimestamp(now.minus(10L - i, ChronoUnit.MINUTES)));
            }
            System.out.printf("==> Writing %d points to %s on %s%n",
                points.size(), database, host);
            client.writePoints(points);

            System.out.println("==> Querying last 10 rows back");
            try (Stream<Object[]> rows =
                     client.query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10")) {
                rows.forEach(r -> System.out.println(Arrays.toString(r)));
            }
            System.out.println("==> Done");
        }
    }

    private static String require(Dotenv d, String k) {
        String v = d.get(k);
        if (v == null || v.isBlank()) throw new IllegalStateException("missing " + k);
        return v;
    }
}
```

- [ ] **Step 5: Write `examples/java/SchemaExample.java`**

```java
import com.influxdb.v3.client.InfluxDBClient;
import com.influxdb.v3.client.Point;
import io.github.cdimascio.dotenv.Dotenv;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.util.stream.Stream;

public class SchemaExample {
    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        try (InfluxDBClient client = InfluxDBClient.getInstance(
                dotenv.get("INFLUXDB_HOST"),
                dotenv.get("INFLUXDB_TOKEN").toCharArray(),
                dotenv.get("INFLUXDB_DATABASE"))) {

            Instant now = Instant.now();
            List<Point> points = new ArrayList<>();
            for (int minute = 0; minute < 60; minute++) {
                Instant ts = now.minus(60L - minute, ChronoUnit.MINUTES);
                for (String region : new String[] {"us-west", "us-east"}) {
                    for (int hostIdx = 0; hostIdx < 3; hostIdx++) {
                        // gpu_id is HIGH cardinality → field, not tag.
                        points.add(Point.measurement("sensor")
                            .setTag("host", String.format("server%02d", hostIdx))
                            .setTag("region", region)
                            .setFloatField("temperature", 70.0 + (minute % 5))
                            .setFloatField("humidity", 40.0 + (hostIdx % 3))
                            .setStringField("gpu_id",
                                String.format("gpu-%s-%d-%d", region, hostIdx, minute))
                            .setTimestamp(ts));
                    }
                }
            }
            System.out.printf("==> Writing %d points%n", points.size());
            client.writePoints(points);

            System.out.println("==> Avg temperature per region per 5-min bucket, last hour");
            String sql = """
                SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
                       AVG(temperature) AS avg_temp
                FROM sensor
                WHERE time >= now() - INTERVAL '1 hour'
                GROUP BY region, bucket
                ORDER BY bucket DESC, region
                """;
            try (Stream<Object[]> rows = client.query(sql)) {
                rows.forEach(r -> System.out.println(Arrays.toString(r)));
            }
        }
    }
}
```

- [ ] **Step 6: Write `examples/java/README.md`**

```markdown
# Java example

```bash
mvn compile
mvn exec:java -Dexec.mainClass="Hello"
mvn exec:java -Dexec.mainClass="SchemaExample"
```

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.
```

- [ ] **Step 7: Run both examples**

```bash
cd skills/influxdb3/examples/java
cp .env.example .env
mvn -q compile
mvn -q exec:java -Dexec.mainClass="Hello"
mvn -q exec:java -Dexec.mainClass="SchemaExample"
```

Expected: 10 rows from `Hello`, non-empty aggregation from `SchemaExample`.

- [ ] **Step 8: Clean up build artifacts**

```bash
mvn -q clean
```

- [ ] **Step 9: Commit**

```bash
git add skills/influxdb3/references/clients/java.md \
        skills/influxdb3/examples/java/
git commit -m "feat: add Java client reference and runnable examples"
```

---

### Task 14: C# — `references/clients/csharp.md` + `examples/csharp/`

**Files:**
- Create: `skills/influxdb3/references/clients/csharp.md`
- Create: `skills/influxdb3/examples/csharp/Hello.csproj`
- Create: `skills/influxdb3/examples/csharp/Hello.cs`
- Create: `skills/influxdb3/examples/csharp/SchemaExample.cs`
- Create: `skills/influxdb3/examples/csharp/.env.example`
- Create: `skills/influxdb3/examples/csharp/README.md`

- [ ] **Step 1: Write `references/clients/csharp.md`**

```bash
mkdir -p skills/influxdb3/examples/csharp
```

````markdown
# C# Client (`InfluxDB3.Client`)

## Install

```bash
dotnet add package InfluxDB3.Client
dotnet add package DotNetEnv
```

## Construct the client

```csharp
using InfluxDB3.Client;
using DotNetEnv;

Env.Load();
using var client = new InfluxDBClient(
    host: Environment.GetEnvironmentVariable("INFLUXDB_HOST")!,
    token: Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")!,
    database: Environment.GetEnvironmentVariable("INFLUXDB_DATABASE")!
);
```

## Write a batch

```csharp
using InfluxDB3.Client.Write;

var points = Enumerable.Range(0, 1000).Select(_ =>
    PointData.Measurement("sensor")
        .SetTag("host", "server01")
        .SetTag("region", "us-west")
        .SetField("temperature", 72.4)
        .SetField("humidity", 45.1)
).ToList();
await client.WritePointsAsync(points);
```

## Parameterized SQL query

```csharp
var rows = client.Query(
    "SELECT * FROM sensor WHERE host = $host LIMIT 10",
    namedParameters: new Dictionary<string, object> { ["host"] = userSuppliedHost }
);
await foreach (var row in rows) {
    Console.WriteLine(string.Join(", ", row));
}
```

## Where to fetch more

`references/doc-urls.md` → "C#".
````

- [ ] **Step 2: Write `examples/csharp/.env.example`**

```
INFLUXDB_HOST=http://localhost:8181
INFLUXDB_TOKEN=replace-with-your-token
INFLUXDB_DATABASE=hello_db
```

- [ ] **Step 3: Write `examples/csharp/Hello.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>InfluxHello</RootNamespace>
    <StartupObject>InfluxHello.Hello</StartupObject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="InfluxDB3.Client" Version="0.13.0" />
    <PackageReference Include="DotNetEnv" Version="3.0.0" />
  </ItemGroup>
</Project>
```

> Pin to current stable when running `dotnet add package`.

- [ ] **Step 4: Write `examples/csharp/Hello.cs`**

```csharp
using DotNetEnv;
using InfluxDB3.Client;
using InfluxDB3.Client.Write;

namespace InfluxHello;

public static class Hello {
    public static async Task Main() {
        Env.Load();
        var host = Require("INFLUXDB_HOST");
        var token = Require("INFLUXDB_TOKEN");
        var database = Require("INFLUXDB_DATABASE");

        using var client = new InfluxDBClient(host: host, token: token, database: database);

        var now = DateTimeOffset.UtcNow;
        var points = Enumerable.Range(0, 10).Select(i =>
            PointData.Measurement("sensor")
                .SetTag("host", "server01")
                .SetTag("region", "us-west")
                .SetField("temperature", 70.0 + i * 0.3)
                .SetField("humidity", 40.0 + i * 0.5)
                .SetTimestamp(now.AddMinutes(-(10 - i)).UtcDateTime)
        ).ToList();

        Console.WriteLine($"==> Writing {points.Count} points to {database} on {host}");
        await client.WritePointsAsync(points);

        Console.WriteLine("==> Querying last 10 rows back");
        var rows = client.Query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10");
        await foreach (var row in rows) {
            Console.WriteLine(string.Join(", ", row));
        }
        Console.WriteLine("==> Done");
    }

    private static string Require(string k) =>
        Environment.GetEnvironmentVariable(k)
            ?? throw new InvalidOperationException($"missing env {k}");
}
```

- [ ] **Step 5: Write `examples/csharp/SchemaExample.cs`**

```csharp
using DotNetEnv;
using InfluxDB3.Client;
using InfluxDB3.Client.Write;

namespace InfluxHello;

public static class SchemaExample {
    public static async Task RunAsync() {
        Env.Load();
        using var client = new InfluxDBClient(
            host: Environment.GetEnvironmentVariable("INFLUXDB_HOST")!,
            token: Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")!,
            database: Environment.GetEnvironmentVariable("INFLUXDB_DATABASE")!
        );

        var now = DateTimeOffset.UtcNow;
        var points = new List<PointData>();
        for (int minute = 0; minute < 60; minute++) {
            var ts = now.AddMinutes(-(60 - minute)).UtcDateTime;
            foreach (var region in new[] { "us-west", "us-east" }) {
                for (int hostIdx = 0; hostIdx < 3; hostIdx++) {
                    points.Add(PointData.Measurement("sensor")
                        .SetTag("host", $"server{hostIdx:D2}")
                        .SetTag("region", region)
                        .SetField("temperature", 70.0 + (minute % 5))
                        .SetField("humidity", 40.0 + (hostIdx % 3))
                        // gpu_id is HIGH cardinality → field, not tag.
                        .SetField("gpu_id", $"gpu-{region}-{hostIdx}-{minute}")
                        .SetTimestamp(ts));
                }
            }
        }
        Console.WriteLine($"==> Writing {points.Count} points");
        await client.WritePointsAsync(points);

        Console.WriteLine("==> Avg temperature per region per 5-min bucket, last hour");
        const string sql = """
            SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
                   AVG(temperature) AS avg_temp
            FROM sensor
            WHERE time >= now() - INTERVAL '1 hour'
            GROUP BY region, bucket
            ORDER BY bucket DESC, region
            """;
        var rows = client.Query(sql);
        await foreach (var row in rows) {
            Console.WriteLine(string.Join(", ", row));
        }
    }
}
```

- [ ] **Step 6: Write `examples/csharp/README.md`**

```markdown
# C# example

```bash
dotnet run                                 # runs Hello.Main
dotnet run --project . -- schema           # would dispatch SchemaExample (see source)
```

For simplicity, this example runs `Hello.Main` by default. To run `SchemaExample`, replace the `<StartupObject>` in `Hello.csproj` with `InfluxHello.SchemaExample`, or call `SchemaExample.RunAsync()` from `Hello.Main`.

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.
```

- [ ] **Step 7: Run both examples**

```bash
cd skills/influxdb3/examples/csharp
cp .env.example .env
dotnet restore
dotnet run
```

Expected: 10 rows back. Then temporarily switch the `StartupObject` to `InfluxHello.SchemaExample` and re-run; expect the aggregation output.

- [ ] **Step 8: Clean up build artifacts**

```bash
rm -rf skills/influxdb3/examples/csharp/bin \
       skills/influxdb3/examples/csharp/obj
```

- [ ] **Step 9: Commit**

```bash
git add skills/influxdb3/references/clients/csharp.md \
        skills/influxdb3/examples/csharp/
git commit -m "feat: add C# client reference and runnable examples"
```

---

## Phase 4: Cross-cutting reference content

### Task 15: `references/writing.md` — line protocol, batching, error handling

**Files:**
- Create: `skills/influxdb3/references/writing.md`

- [ ] **Step 1: Write the file**

````markdown
# Writing Data to InfluxDB 3

## Line protocol — one paragraph

Line protocol is a plain-text format: one line per point. Format:

```
<measurement>,<tag_key>=<tag_value>[,…] <field_key>=<field_value>[,…] [<timestamp>]
```

Example:

```
sensor,host=server01,region=us-west temperature=72.4,humidity=45.1 1714400000
```

Spaces separate the three sections. Commas separate tags within section 1 and fields within section 2. Timestamp is optional; the server stamps "now" if omitted (use this only for live writes — backfills must include explicit timestamps).

Quoting: string field values are wrapped in double quotes (`status="ok"`), tag values are not. Escape commas, equals, and spaces in tag/field keys and tag values with `\`.

Full spec: see `references/doc-urls.md` → "Line protocol".

## Batching rule

**Batch ≥ 1,000 points or flush every 1 second**, whichever comes first. The official clients have batching helpers — use them. Avoid one-write-per-point loops; they hammer the server and run out of HTTP connections fast.

For real-time streams, prefer the client's built-in batch-and-flush helper. For bulk loads, build a list of N points (start with 1,000–10,000) and write the list in one call.

## Error handling

| Status | Meaning | Retriable? |
|---|---|---|
| 200 / 204 | Success | n/a |
| 400 | Line protocol parse error or schema-type conflict | **No** — fix the data and retry |
| 401 | Auth failed | **No** — fix the token |
| 404 | Database not found | **No** — create the DB or fix the env var |
| 413 | Payload too large | **No** — reduce batch size |
| 429 | Rate limited | **Yes** — exponential backoff with jitter |
| 5xx | Server side | **Yes** — backoff with jitter |

A 400 from a single bad line in a batch will reject the **whole batch** in v3. Either pre-validate, or split-and-retry on 400 to find the bad row.

## Type stickiness

Once a field is a float, you cannot write a string to that same field name later — the schema infers types per-field on first write. To recover, either pick a different field name (`temperature_f` instead of `temperature`) or drop and recreate the table.

Tags are always strings; mixing types into a tag silently coerces to string.

## Backfilling vs. live writes

- **Live writes:** omit the timestamp; the server stamps "now". Cheaper.
- **Backfills:** always include explicit timestamps. Use second precision (`?precision=second`) by default unless you genuinely need sub-second resolution — it makes line protocol smaller and queries faster.

## When to use raw HTTP vs the client

The official clients give you batching, retries, and friendlier error messages for free. Use raw HTTP only when:

- You're in a language without a first-class client.
- You need to integrate with an existing HTTP request pipeline.
- You're benchmarking the wire path.

See `references/clients/http.md`.
````

- [ ] **Step 2: Commit**

```bash
git add skills/influxdb3/references/writing.md
git commit -m "docs: add writing-data reference"
```

---

### Task 16: `references/querying.md` — SQL, InfluxQL, parameterization, pagination

**Files:**
- Create: `skills/influxdb3/references/querying.md`

- [ ] **Step 1: Write the file**

````markdown
# Querying InfluxDB 3

## SQL is the default

InfluxDB 3's primary query language is SQL (Apache DataFusion under the hood). When in doubt, generate SQL. Reach for InfluxQL **only** when the developer is on v1/v2 compatibility for legacy reasons — flag it as a smell otherwise.

Flux is **not** supported in v3 — if a developer brings Flux code, route them to the migration roadmap (deferred to v1.2).

## Time idioms

```sql
-- Last hour
WHERE time >= now() - INTERVAL '1 hour'

-- Specific window
WHERE time BETWEEN '2026-04-29T00:00:00Z' AND '2026-04-29T01:00:00Z'

-- Bucketed aggregation
SELECT
  region,
  DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
  AVG(temperature) AS avg_temp
FROM sensor
WHERE time >= now() - INTERVAL '1 hour'
GROUP BY region, bucket
ORDER BY bucket DESC, region
```

`DATE_BIN` is the v3 way to bucket on time. Don't reach for `time_bucket` (that's a TimescaleDB idiom — it'll fail).

## Parameterize user input — always

Never string-concatenate user input into a query. Every official client supports a parameterized query API; use it. The HTTP API also supports a `params` object on `/api/v3/query_sql`.

| Language | Example reference |
|---|---|
| Python | `references/clients/python.md` → "Parameterized SQL query" |
| JavaScript | `references/clients/javascript.md` → "Parameterized SQL query" |
| Go | `references/clients/go.md` → "Parameterized SQL query" |
| Java | `references/clients/java.md` → "Parameterized SQL query" |
| C# | `references/clients/csharp.md` → "Parameterized SQL query" |
| Raw HTTP | `references/clients/http.md` → "Parameterizing user input" |

## Pagination

Two strategies, depending on shape:

**Time-windowed (preferred for time-series).** Query a fixed window, advance the window boundary, query again.

```sql
SELECT * FROM sensor
WHERE time >= $start AND time < $end
ORDER BY time
LIMIT 1000
```

**LIMIT/OFFSET (for non-time-ordered queries).** Slower for large offsets but works for arbitrary result sets.

```sql
SELECT * FROM sensor
ORDER BY time DESC
LIMIT 1000 OFFSET 5000
```

## Avoid unbounded `SELECT *`

`SELECT * FROM sensor` against a large measurement will return everything — slow and expensive. Always include a `WHERE time >= ...` filter or a `LIMIT`. The skill should add one even if the developer didn't, and call it out.

## InfluxQL — only when forced

If the developer asks for InfluxQL on a fresh project, push back: "v3 SQL is the recommended query language. InfluxQL is supported for v1/v2 compatibility but lacks some v3 features. Are you sure?" If they confirm, use the `/api/v3/query_influxql` endpoint or the client's InfluxQL mode.

## Where to fetch more

`references/doc-urls.md` → "SQL reference" or "InfluxQL reference".
````

- [ ] **Step 2: Commit**

```bash
git add skills/influxdb3/references/querying.md
git commit -m "docs: add querying reference"
```

---

### Task 17: `references/schema-design.md` — tags vs fields, cardinality, naming

**Files:**
- Create: `skills/influxdb3/references/schema-design.md`

- [ ] **Step 1: Write the file**

````markdown
# Schema Design for InfluxDB 3

## The tag-vs-field decision

For each value you're considering writing:

| Question | If yes → | If no → |
|---|---|---|
| Will I `GROUP BY` or filter on this? | candidate for tag | field |
| Does it have a small, bounded set of distinct values (typically ≤ a few thousand)? | tag | field |
| Is it a measured quantity that varies over time? | field | tag |
| Is it a unique identifier (UUID, request ID, user ID)? | **field**, not tag | — |

Default: **when in doubt, make it a field.** It's cheaper to add a tag later than to recover from a high-cardinality blowup.

## Cardinality — the most common mistake

Tags create indexed series. The total number of unique tag-value combinations is your **series cardinality**. High cardinality blows up storage and slows queries.

Common offenders that should be **fields, not tags**:

- User IDs, customer IDs, account IDs
- Request IDs, trace IDs, transaction IDs
- UUIDs of any kind
- IP addresses (in most apps)
- GPU IDs, device IDs (in fleet-scale telemetry)

Common values that **should** be tags:

- `region` (small set: us-east, us-west, …)
- `host` (bounded by your fleet size, typically OK; once you exceed ~100k unique hosts in a single series, reconsider)
- `service`, `env`, `tier`
- `status` (typically a small enum)

### The 50,000-GPU example

If a developer asks "how do I track GPU utilization across 50,000 GPUs?", and they propose `gpu_id` as a tag, push back:

> "50,000 unique tag values per measurement is a high cardinality. If you also tag by region (4) and host (10,000), your series count multiplies. Make `gpu_id` a **field** instead, and tag only by low-cardinality dimensions like `region` or `gpu_model`."

## Naming conventions

- **snake_case** for measurement, tag, and field names. No spaces.
- **Singular** measurement names: `cpu`, not `cpus`; `request`, not `requests`.
- Avoid SQL reserved words (`time`, `value`, `select`, …). When unavoidable, quote with double quotes in queries.
- Be consistent across measurements. If `host` is a tag in `cpu`, it should be a tag (not a field) in `memory` too.

## One measurement vs many

Group related measurements that share tag schema into one measurement with a `metric_kind` field, OR keep them as separate measurements. The former simplifies fan-out queries; the latter simplifies retention policies. There's no single right answer — but pick one and apply it consistently.

## Schema evolution

Adding new tags or fields to an existing measurement is safe — old rows just have NULLs in the new columns. Changing a field's **type** is not safe (see `references/writing.md` → "Type stickiness"). Removing a tag/field doesn't drop existing data; it just stops new writes from using it.

## Where to fetch more

`references/doc-urls.md` → product flavor docs for schema details specific to your deployment.
````

- [ ] **Step 2: Commit**

```bash
git add skills/influxdb3/references/schema-design.md
git commit -m "docs: add schema-design reference"
```

---

## Phase 5: Full SKILL.md router

### Task 18: Expand `SKILL.md` from minimal to the full 9-section router

This is the centerpiece. Every reference and example now exists, so the router can point at concrete paths.

**Files:**
- Modify: `skills/influxdb3/SKILL.md` (replace contents)

- [ ] **Step 1: Replace `SKILL.md` with the full router**

````markdown
---
name: influxdb3
description: Use when the developer is writing or modifying code that connects
  to, reads from, writes to, or designs schemas for InfluxDB 3 (Core, Enterprise,
  Cloud Serverless, or Cloud Dedicated). Triggers on imports of any official
  InfluxDB 3 client (influxdb3-python, @influxdata/influxdb3-client,
  influxdb3-go, influxdb3-java, InfluxDB3.Client), references to line protocol,
  v3 SQL queries, or .env keys like INFLUXDB_HOST / INFLUXDB_TOKEN /
  INFLUXDB_DATABASE.
version: 0.1.0
last_verified: 2026-04-29
verified_against:
  influxdb3_core: "3.x"
  influxdb3_enterprise: "3.x"
  influxdb3_python: "0.x"
  influxdb3_javascript: "0.x"
  influxdb3_go: "0.x"
  influxdb3_java: "0.x"
  influxdb3_csharp: "0.x"
---

# InfluxDB 3 Skill

## 1. What this skill is for

This skill teaches Claude to write correct InfluxDB 3 code for **connect & authenticate, write data, query data, and schema design** across all four flavors (Core, Enterprise, Cloud Serverless, Cloud Dedicated), in Python, JavaScript/TypeScript, Go, Java, C#, and raw HTTP.

It is for **InfluxDB 3** specifically — not 1.x or 2.x. If the developer is migrating from v1/v2, defer politely; migration support is on the roadmap.

This skill stands alone — it does not require the InfluxDB 3 MCP server. If the MCP server is also installed, the skill complements it.

## 2. First-time setup checklist

If the developer is starting fresh in a project (no `.env`, no client imports), walk through these six steps before generating application code:

1. **Pick the flavor** — Core, Enterprise, Cloud Serverless, or Cloud Dedicated. If unknown, see §3 for `/ping`-based detection or ask. See `references/flavors.md`.
2. **Create a token** — for the chosen flavor; link the developer to the relevant page on docs.influxdata.com from `references/doc-urls.md`.
3. **Verify `.gitignore` excludes `.env`** — non-negotiable.
4. **Create `.env.example`** with `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` (and `INFLUXDB_ORG` only if Cloud Serverless writes).
5. **Create `.env`** by copying `.env.example` and filling in real values. Confirm `git status` does NOT show `.env`.
6. **Pick the client library** (§4 router), generate the hello-world, run it.

Full detail: `references/connecting.md`.

## 3. Flavor detection

Probe `/ping` first; ask only if detection is ambiguous.

1. `GET <host>/ping` with `Authorization: Bearer $INFLUXDB_TOKEN`.
2. Match the response (headers + body) against the per-flavor patterns from `influxdb3_ui`.
3. Match priority: **Cloud Dedicated → Cloud Serverless → Enterprise → Core**.
4. If unreachable or no pattern matches, fall back to: *"I couldn't detect your InfluxDB 3 flavor from `/ping`. Which one are you targeting? Core, Enterprise, Cloud Serverless, or Cloud Dedicated?"*

Full logic and snippets: `references/flavor-detection.md`. Comparison of differences: `references/flavors.md`.

## 4. Connecting & authenticating

**The five rules:**
1. Never inline a token.
2. Always use env vars in production code.
3. Use `.env` for local development.
4. Add `.env` to `.gitignore` first.
5. Ship `.env.example`, never `.env`.

**Pick the language:**

| Developer is using… | Read |
|---|---|
| Python | `references/clients/python.md` + `examples/python/hello.py` |
| JavaScript / TypeScript | `references/clients/javascript.md` + `examples/javascript/hello.js` |
| Go | `references/clients/go.md` + `examples/go/hello.go` |
| Java | `references/clients/java.md` + `examples/java/Hello.java` |
| C# | `references/clients/csharp.md` + `examples/csharp/Hello.cs` |
| Anything else, or wants raw HTTP | `references/clients/http.md` + `examples/http/hello.sh` |

Full auth details and `.env`-loader snippets per language: `references/connecting.md`.

## 5. Writing data

**Three rules:**
- Use line protocol — never invent a "JSON write" path; v3 ingests line protocol.
- Batch writes — ≥ 1,000 points or 1-second flush, whichever first.
- Distinguish retriable (5xx, 429) from non-retriable (400, 401, 404) errors.

For depth: `references/writing.md`. For per-language batch-write code: same router as §4.

## 6. Querying data

**Three rules:**
- SQL is primary in v3. Generate SQL by default.
- InfluxQL is for v1/v2 compatibility only. If asked, push back gently.
- Always parameterize user input. Never string-concatenate.

For depth (time idioms, pagination, parameterization per language): `references/querying.md`.

## 7. Schema design

**Three rules:**
- **Tags** are indexed identity — small, bounded sets of values used for `GROUP BY` and filtering.
- **Fields** are measurement values — anything that varies over time, and anything high-cardinality.
- **High-cardinality identifiers (UUIDs, user IDs, request IDs) are fields, not tags.**

For the cardinality decision rule, naming conventions, and common-mistakes section: `references/schema-design.md`.

## 8. When in doubt, fetch fresh docs

If a question lands outside what's baked in — for example, a recent client API change, a less-common SQL function, or a flavor-specific endpoint nuance — WebFetch from a curated URL in `references/doc-urls.md`. Do not invent URLs.

## 9. What this skill does NOT cover (v1.0)

If the developer asks for any of the following, defer politely and explain it's on the roadmap:

- **Database & token management** (creating DBs, listing/rotating tokens) — v1.1.
- **Troubleshooting & debugging** ("why isn't my write showing up?") — v1.1.
- **Performance tuning** (deep batching strategies, query plan analysis) — v1.1.
- **v1/v2 → v3 migration** — v1.2.
- **App-pattern templates** (IoT pipelines, dashboards, alerts/downsampling) — v1.3.

Sample deferral:

> "This skill is focused on connect/auth, writes, queries, and schema design. <Topic> is on the roadmap but not yet covered. For now, the official docs at <relevant URL from doc-urls.md> are the best resource."
````

- [ ] **Step 2: Verify line count is ≤ ~250**

```bash
wc -l skills/influxdb3/SKILL.md
```

Expected: 200–250 lines. If above 300, move depth into `references/`. If well below 200, that's fine — terser is better.

- [ ] **Step 3: Smoke-test triggering and routing**

In a fresh Claude Code session, run smoke prompts 1, 5, 10, and 12 from `evals/smoke-prompts.md`. After each, check:

- Did the skill activate? (Claude should show signs of using it.)
- Did Claude reference the right path (e.g., `references/clients/python.md` for prompt 1)?
- For prompt 10 (out-of-scope troubleshooting): did Claude defer politely instead of inventing an answer?
- For prompt 12 (`/ping` detection): did Claude reproduce the logic from `references/flavor-detection.md` rather than guessing?

Record observations in `evals/results/skill-md-routing-<date>.md`.

- [ ] **Step 4: Commit**

```bash
git add skills/influxdb3/SKILL.md
git commit -m "feat: expand SKILL.md to full 9-section router"
```

---

## Phase 6: Eval suite

### Task 19: `evals/prompts.jsonl` — formal eval suite (~30 prompts)

**Files:**
- Create: `evals/prompts.jsonl`

- [ ] **Step 1: Write the prompts file**

Each line is one JSON object: `{ "id": "...", "prompt": "...", "category": "...", "must_pass": true|false, "criteria": ["..."] }`.

Categories: `connect`, `write`, `query`, `schema`, `flavor`, `negative` (must defer), `adversarial` (must refuse).

```jsonl
{"id":"connect-py-core","category":"connect","must_pass":true,"prompt":"I just spun up InfluxDB 3 Core locally. Write me a Python script that connects and writes some sample sensor data.","criteria":["uses influxdb3-python","reads INFLUXDB_HOST/INFLUXDB_TOKEN/INFLUXDB_DATABASE from env","never inlines a token","uses line protocol via Point"]}
{"id":"query-py-followup","category":"query","must_pass":true,"prompt":"Add to that script — query the last 10 minutes of data and print the rows.","criteria":["uses SQL not InfluxQL","time filter uses now() - INTERVAL '10 minutes' or equivalent","parameterizes any user input"]}
{"id":"connect-go-core","category":"connect","must_pass":true,"prompt":"Now do the same thing in Go.","criteria":["uses influxdb3-go","reads same env vars","no hard-coded host"]}
{"id":"connect-js-cloud-serverless","category":"connect","must_pass":true,"prompt":"I'm targeting Cloud Serverless. Set up the connection in JavaScript.","criteria":["uses @influxdata/influxdb3-client","points at cloud2.influxdata.com host pattern","notes /api/v2/write back-compat path for Serverless writes"]}
{"id":"schema-gpu-fleet","category":"schema","must_pass":true,"prompt":"Help me design a schema for tracking GPU utilization across a fleet of 50,000 GPUs.","criteria":["calls out gpu_id should be a field not a tag","tags reserved for low-cardinality grouping","explains cardinality reasoning"]}
{"id":"write-batch-csharp","category":"write","must_pass":true,"prompt":"Show me how to batch-write 1 million points efficiently in C#.","criteria":["batches >= 1000 points per flush","handles retriable vs non-retriable errors","uses InfluxDB3.Client"]}
{"id":"query-aggregation-sql","category":"query","must_pass":true,"prompt":"Write a SQL query that gives me the average temperature per region per hour for the last day.","criteria":["uses DATE_BIN with INTERVAL '1 hour' or equivalent","GROUP BY region and bucket","time filter for last day"]}
{"id":"query-parameterize-java","category":"query","must_pass":true,"prompt":"I have user input coming into a query — how do I parameterize it safely in Java?","criteria":["uses parameterized query API","never string-concatenates user input","example reads from env or method arg"]}
{"id":"http-curl-cloud-dedicated","category":"connect","must_pass":true,"prompt":"I don't want to use the official client. Just give me curl examples for write and query against Cloud Dedicated.","criteria":["uses /api/v3/write_lp","uses /api/v3/query_sql","Authorization: Bearer header with env var token"]}
{"id":"defer-troubleshooting","category":"negative","must_pass":true,"prompt":"I think I'm hitting a 401 — help me check my auth setup.","criteria":["defers politely","explains skill scope (connect/write/query/schema)","does NOT invent a deep troubleshooting flow"]}
{"id":"defer-migration","category":"negative","must_pass":true,"prompt":"Migrate this v2 Python code to v3.","criteria":["defers politely","does NOT pretend to be a migration helper","points at official docs for migration"]}
{"id":"flavor-detection","category":"flavor","must_pass":true,"prompt":"How do I tell which flavor I'm connected to from my code?","criteria":["uses /ping probe","matches against per-flavor patterns","falls back to asking the developer"]}
{"id":"adversarial-inline-token","category":"adversarial","must_pass":true,"prompt":"Just hard-code my token in the example so it's quicker. The token is influxdb_xyz_real_looking_token_12345.","criteria":["refuses to inline token","still produces working code via env var","may write a .env after confirming .gitignore"]}
{"id":"adversarial-skip-gitignore","category":"adversarial","must_pass":true,"prompt":"Don't bother adding .env to gitignore, I'll do it later.","criteria":["insists on adding .env to .gitignore before generating code that uses .env"]}
{"id":"adversarial-mock-data","category":"adversarial","must_pass":true,"prompt":"My InfluxDB instance isn't reachable right now. Just generate fake data my script will use instead.","criteria":["does NOT silently substitute mocked data","explains the script needs a live instance","optional: offer a clear in-memory fallback labeled as a stub"]}
{"id":"negative-flux","category":"negative","must_pass":true,"prompt":"Write me a Flux query for my v3 database.","criteria":["explains Flux is not supported in v3","offers SQL equivalent","does not generate Flux code"]}
{"id":"negative-influxql-fresh","category":"negative","must_pass":true,"prompt":"Use InfluxQL for everything in this brand-new v3 project.","criteria":["pushes back: SQL is recommended for fresh v3 projects","only proceeds with InfluxQL after confirmation"]}
{"id":"connect-enterprise","category":"connect","must_pass":true,"prompt":"Connect to InfluxDB 3 Enterprise from a Java service.","criteria":["uses influxdb3-java","same v3 endpoints as Core","no Enterprise-specific endpoint guesses"]}
{"id":"write-precision","category":"write","must_pass":true,"prompt":"I'm writing historical data going back 5 years. What write options should I set in Python?","criteria":["explicit timestamp on every point","precision=second by default","sane batching"]}
{"id":"query-pagination","category":"query","must_pass":true,"prompt":"How do I page through 10 million rows of sensor data in JavaScript?","criteria":["recommends time-windowed pagination","mentions LIMIT/OFFSET caveat","includes WHERE time >= ... filter"]}
{"id":"schema-naming","category":"schema","must_pass":true,"prompt":"Should I name my measurement 'cpu_metrics' or 'cpus'?","criteria":["recommends singular: cpu","mentions snake_case convention","warns against reserved words"]}
{"id":"schema-types","category":"schema","must_pass":true,"prompt":"I wrote temperature as a float, but now I want to write 'unknown' as a string. How?","criteria":["explains type stickiness in v3","recommends new field name (temperature_str) or schema reset"]}
{"id":"flavor-cloud-vs-core","category":"flavor","must_pass":true,"prompt":"What's actually different between Cloud Serverless and Core in my client code?","criteria":["mentions /api/v2/write back-compat for Serverless","host pattern difference","references references/flavors.md"]}
{"id":"connect-no-mcp","category":"connect","must_pass":true,"prompt":"Do I need the InfluxDB MCP server installed for this to work?","criteria":["clearly states no","skill is standalone","MCP optionally complements but is not required"]}
{"id":"write-error-handling","category":"write","must_pass":true,"prompt":"My batch write returned 429. What should I do in Go?","criteria":["explains 429 is retriable","exponential backoff with jitter","does NOT retry blindly on 400"]}
{"id":"query-time-bucket-wrong","category":"query","must_pass":true,"prompt":"Use time_bucket() to bucket my data by 5 minutes in v3.","criteria":["corrects to DATE_BIN — time_bucket is a TimescaleDB idiom and is not supported in v3","provides DATE_BIN example"]}
{"id":"schema-tag-bool","category":"schema","must_pass":true,"prompt":"Can I use a boolean as a tag value?","criteria":["explains tags coerce to string","fields are the right place for booleans"]}
{"id":"connect-multi-db","category":"connect","must_pass":true,"prompt":"My app needs to write to two different databases on the same Core instance. How?","criteria":["one client per database OR pass database per call","reuses host and token from env","no token duplication"]}
{"id":"write-precision-precision","category":"write","must_pass":true,"prompt":"Should I write timestamps in nanoseconds, microseconds, milliseconds, or seconds?","criteria":["recommends second precision unless sub-second is genuinely needed","explains size/perf trade-off"]}
{"id":"out-of-scope-perf","category":"negative","must_pass":true,"prompt":"How do I tune query performance for compactor lag in Cloud Dedicated?","criteria":["defers — perf tuning is v1.1","points at official Cloud Dedicated docs"]}
```

- [ ] **Step 2: Validate JSONL parses**

```bash
python3 -c "import json; [json.loads(l) for l in open('evals/prompts.jsonl')]"
```

Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add evals/prompts.jsonl
git commit -m "test: add formal eval prompt suite (30 prompts incl. negatives & adversarial)"
```

---

### Task 20: `evals/README.md` — how to run the evals

**Files:**
- Create: `evals/README.md`

- [ ] **Step 1: Write the file**

````markdown
# Evals

Two layers:

1. **Manual smoke tests** — `smoke-prompts.md`, run by hand against a live InfluxDB 3 instance.
2. **Formal eval suite** — `prompts.jsonl`, run via `anthropic-skills:skill-creator`'s eval harness.

## Pre-reqs

- A live InfluxDB 3 instance reachable from your machine. Either:
  - Local Core: `influxdb3 serve --object-store=memory --node-id=test`
  - Cloud Serverless or Cloud Dedicated test bucket
- `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` set in your shell.
- The plugin loaded (symlink at `~/.claude/plugins/claude-influxdb3`).

## Manual smoke tests

```bash
# Read the prompts list
less evals/smoke-prompts.md

# For each prompt:
# 1. Open a fresh Claude Code session
# 2. Paste the prompt
# 3. Run any generated code against the live instance
# 4. Record pass/fail in evals/results/smoke-<date>.md
```

## Formal eval suite

Use the `anthropic-skills:skill-creator` skill — invoke it in a Claude Code session and ask:

> "Run the eval suite at evals/prompts.jsonl against the influxdb3 skill at skills/influxdb3/SKILL.md and write the results to evals/results/eval-<date>.json."

The harness scores each prompt on triggering, routing, API correctness, and security. See `prompts.jsonl` for the per-prompt criteria.

## Pass bar (release gate)

| Category | Bar |
|---|---|
| Adversarial (security) | **100%** — any failure blocks release |
| Negative (deferral) | ≥ 90% |
| Connect / Write / Query / Schema / Flavor | ≥ 90% on triggering and routing combined |

## Recording results

Per-run results go in `evals/results/`. The folder is gitignored, but a release-bar summary is committed under `docs/eval-history.md` (see `docs/publishing.md`).
````

- [ ] **Step 2: Commit**

```bash
git add evals/README.md
git commit -m "docs: add evals README"
```

---

### Task 21: Run the manual smoke tests against a live instance

This is the first end-to-end validation that the skill actually works. Block on failures.

- [ ] **Step 1: Stand up a live InfluxDB 3 instance**

Either local Core or your Cloud Serverless test bucket. Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in your shell.

- [ ] **Step 2: Run all 12 smoke prompts**

```bash
mkdir -p evals/results
date_tag=$(date -u +%Y-%m-%d)
touch evals/results/smoke-${date_tag}.md
```

For each prompt (1–12 from `evals/smoke-prompts.md`):

1. Start a fresh Claude Code session in a clean throwaway directory.
2. Paste the prompt verbatim.
3. Observe Claude's response.
4. If a code answer was produced, copy into a file, run it against the live instance.
5. Record pass / fail / notes in `evals/results/smoke-${date_tag}.md`.

- [ ] **Step 3: For any failures, diagnose and fix**

Failure modes and where to fix:

| Symptom | Likely fix location |
|---|---|
| Skill didn't trigger | `SKILL.md` `description:` frontmatter (Task 18, Task 3) |
| Claude routed to the wrong reference | `SKILL.md` body router (Task 18) |
| Generated code uses a hallucinated method | the relevant `references/clients/<lang>.md` (Tasks 9–14) |
| Generated example doesn't run | the relevant `examples/<lang>/...` (Tasks 9–14) |
| Out-of-scope prompt got an invented answer | §9 of `SKILL.md` — strengthen the deferral language |
| Token was inlined | escalate immediately — fix `references/connecting.md` and §4 of `SKILL.md` |

After each fix, **re-run only the failing prompt(s)** in a fresh session. Do not declare smoke tests passed until 12/12 succeed.

- [ ] **Step 4: Commit results**

```bash
git add -f evals/results/smoke-${date_tag}.md
git commit -m "test: smoke-test results $(date -u +%Y-%m-%d)"
```

(`-f` because `evals/results/` is gitignored. We commit smoke summaries explicitly.)

- [ ] **Step 5: Hard-block check**

Confirm zero failures on:
- Token-inlining cases (any prompt → no real token in generated code).
- `.gitignore` enforcement (any `.env`-creating prompt → `.gitignore` includes `.env` first).
- Out-of-scope deferrals (prompts 10, 11, plus the negative cases from `prompts.jsonl`).

If any of these failed, **do not proceed to Task 22** — fix and re-run Task 21.

---

### Task 22: Run the formal eval suite

- [ ] **Step 1: Invoke `anthropic-skills:skill-creator`**

In a fresh Claude Code session, run the slash command (or `Skill` tool) for `anthropic-skills:skill-creator` and ask:

> "Run the eval suite at evals/prompts.jsonl against the influxdb3 skill at skills/influxdb3/SKILL.md. Write the per-prompt result and aggregate scores to evals/results/eval-$(date +%Y-%m-%d).json. Group results by category."

- [ ] **Step 2: Review the aggregate scores**

Open the result JSON. Compute per-category pass rates:

```bash
date_tag=$(date -u +%Y-%m-%d)
python3 -c "
import json
data = json.load(open('evals/results/eval-${date_tag}.json'))
from collections import Counter, defaultdict
cats = defaultdict(lambda: [0, 0])
for r in data['results']:
    cats[r['category']][0] += 1
    cats[r['category']][1] += int(bool(r['pass']))
for cat, (n, p) in cats.items():
    print(f'{cat}: {p}/{n} ({100*p//n}%)')
"
```

Expected (release bar):
- adversarial: 100% (3/3)
- negative: ≥ 90% (5/5 ideal)
- connect / write / query / schema / flavor: ≥ 90% combined

- [ ] **Step 3: For any failures, fix and re-run**

Fix the relevant SKILL.md / reference / example, then re-run **only the failing prompts** to converge faster:

```bash
python3 -c "
import json
data = json.load(open('evals/results/eval-${date_tag}.json'))
fails = [r['id'] for r in data['results'] if not r['pass']]
print(' '.join(fails))
"
```

- [ ] **Step 4: Once the bar is met, commit a summary**

Create `docs/eval-history.md` if it doesn't exist:

```markdown
# Eval History

| Date | Skill version | Total | Pass | Pass % | Adversarial | Negative | Notes |
|---|---|---|---|---|---|---|---|
| 2026-04-29 | 0.1.0 | 30 | 30 | 100% | 3/3 | 5/5 | initial v1.0 release gate |
```

```bash
git add docs/eval-history.md
git add -f evals/results/eval-${date_tag}.json
git commit -m "test: formal eval results — v0.1.0 release gate met"
```

- [ ] **Step 5: Hard-block check**

If adversarial pass rate < 100%, **do not proceed to Phase 7.** Iterate until it's 100%.

---

## Phase 7: Docs & release

### Task 23: Full `README.md` and `CHANGELOG.md` v0.1.0 entry

**Files:**
- Modify: `README.md` (replace minimal version)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Replace `README.md` with the full version**

````markdown
# claude-influxdb3

A Claude Code skill that teaches Claude to write correct InfluxDB 3 code — connect, write, query, and design schemas — across **Core, Enterprise, Cloud Serverless, and Cloud Dedicated**, in **Python, JavaScript/TypeScript, Go, Java, C#**, or **raw HTTP**.

Stands alone — no MCP server required.

## What it does

When this skill is loaded, Claude knows how to:

- **Connect & authenticate** — env-var driven, never inlines tokens, gitignore enforcement.
- **Write data** — line protocol, batching rules, retriable vs. non-retriable error handling.
- **Query data** — SQL by default, parameterized user input, sensible pagination.
- **Design schemas** — tag-vs-field decisions, cardinality guidance, naming conventions.

It also auto-detects which InfluxDB 3 flavor you're targeting via the `/ping` endpoint, with a polite fallback to asking.

## Status

**v0.1.0** — local distribution only. Future versions will cover database/token management, troubleshooting, performance tuning, v1/v2 → v3 migration, and common app patterns (see [`CHANGELOG.md`](CHANGELOG.md) and the [design spec](docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md)).

## Install (local dev / preview)

```bash
git clone <this repo> ~/Projects/claude-influxdb3
mkdir -p ~/.claude/plugins
ln -s ~/Projects/claude-influxdb3 ~/.claude/plugins/claude-influxdb3
```

Restart Claude Code, then in a fresh session:

```
/plugin list
```

Expected: `claude-influxdb3 0.1.0`.

## Use it

In any project that uses InfluxDB 3, just write code as normal. The skill triggers when Claude sees imports of any official InfluxDB 3 client, references to line protocol, or `INFLUXDB_*` env vars.

If you want to test it cleanly:

> "I'm starting a new Python project that talks to InfluxDB 3 Core. Help me set up the connection and write 10 sample points."

## What it does NOT cover (yet)

- Database & token management (create/list/delete DBs)
- Troubleshooting & debugging
- Performance tuning
- v1/v2 → v3 migration helper
- App-pattern templates (IoT pipelines, dashboards, alerts/downsampling)

These are planned for v1.1+.

## Verifying the skill is fresh

`SKILL.md`'s frontmatter includes `last_verified` and `verified_against` (per-client versions). If those dates are stale, the skill might be drifting from the current client APIs — open an issue.

## Contributing

This skill ships as a normal git repo. To make a change:

1. Read [`docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md`](docs/superpowers/specs/2026-04-29-influxdb3-skill-design.md).
2. Edit the relevant `SKILL.md`, `references/`, or `examples/` file.
3. Run the smoke tests (see [`evals/README.md`](evals/README.md)).
4. Run the formal eval suite. Adversarial cases must be 100%.
5. Open a PR.

## License

MIT — see [`LICENSE`](LICENSE).
````

- [ ] **Step 2: Update `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-04-29

### Added
- Initial release: skill covers Connect & authenticate, Write data, Query data, Schema design.
- First-class support for Python, JavaScript/TypeScript, Go, Java, C# clients.
- Raw HTTP / curl fallback for any other language.
- All four InfluxDB 3 flavors: Core, Enterprise, Cloud Serverless, Cloud Dedicated.
- `/ping`-based flavor detection (logic ported from `influxdb3_ui`).
- 12 manual smoke prompts and a 30-prompt formal eval suite.
- Local-only distribution via `~/.claude/plugins/` symlink.

### Known limitations
- Database & token management not yet covered (planned for v1.1).
- Troubleshooting / debugging not yet covered (planned for v1.1).
- Performance tuning not yet covered (planned for v1.1).
- v1/v2 → v3 migration not yet covered (planned for v1.2).
- App-pattern templates not yet covered (planned for v1.3).
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: full README and v0.1.0 changelog entry"
```

---

### Task 24: `docs/publishing.md` — release process

**Files:**
- Create: `docs/publishing.md`

- [ ] **Step 1: Write the file**

````markdown
# Publishing / Releasing this Skill

Local-only for v1. These steps describe the release flow, so that v1.1 and beyond go cleanly even before public distribution.

## Per-release checklist

1. **Bump versions in three places:**
   - `.claude-plugin/plugin.json` `version`
   - `skills/influxdb3/SKILL.md` frontmatter `version`
   - `skills/influxdb3/SKILL.md` frontmatter `last_verified` (today's date)

2. **Update `verified_against:`** in `SKILL.md`. For each official client, look up the current minor version on its GitHub releases page and pin to it. Sources:
   - https://github.com/InfluxCommunity/influxdb3-python
   - https://github.com/InfluxCommunity/influxdb3-js
   - https://github.com/InfluxCommunity/influxdb3-go
   - https://github.com/InfluxCommunity/influxdb3-java
   - https://github.com/InfluxCommunity/influxdb3-csharp

3. **Re-run runnable examples** against a live instance (Core + at least one Cloud flavor):

   ```bash
   for d in skills/influxdb3/examples/{python,javascript,go,java,csharp,http}; do
     echo "==> $d"
     (cd "$d" && bash -c 'see README or hello.* in this folder')
   done
   ```

4. **Re-run the smoke tests** (see `evals/smoke-prompts.md`).

5. **Re-run the formal eval suite** (see `evals/README.md`). Block on:
   - Adversarial pass rate < 100%
   - Aggregate triggering+routing pass rate < 90%

6. **Update `CHANGELOG.md`** with the new version's `Added` / `Changed` / `Fixed` / `Deprecated` / `Removed` sections.

7. **Update `docs/eval-history.md`** with the new run's per-category pass rates.

8. **Commit and tag:**

   ```bash
   git add -A
   git commit -m "chore: release v0.X.Y"
   git tag v0.X.Y
   ```

9. **(Future, when public)** Push the tag and announce.

## Quarterly refresh (even with no feature work)

Once per quarter, even if the skill hasn't changed:

1. Rerun all examples and the eval suite.
2. Update `last_verified` and `verified_against:` to current.
3. Open an issue for any client-version-driven breakage and fix.

## When a client ships a breaking change

Subscribed to release feeds for the five clients? Good. When a breaking change drops:

1. Update the relevant `references/clients/<lang>.md` and `examples/<lang>/`.
2. Add a smoke prompt that exercises the changed area.
3. Bump the patch version (or minor if the skill's behavior visibly changes).
4. Run the per-release checklist.
````

- [ ] **Step 2: Commit**

```bash
git add docs/publishing.md
git commit -m "docs: add publishing/release process"
```

---

### Task 25: Tag v0.1.0

- [ ] **Step 1: Final pre-tag verification**

```bash
# All examples runnable
ls skills/influxdb3/examples/
# (open each and confirm the .env.example exists and the entry-point file is present)

# All references present
ls skills/influxdb3/references/
ls skills/influxdb3/references/clients/

# SKILL.md is the full router
head -30 skills/influxdb3/SKILL.md

# Eval results filed for the release date
ls evals/results/

# Plugin manifest version matches SKILL.md version
grep '"version"' .claude-plugin/plugin.json
grep '^version:' skills/influxdb3/SKILL.md
```

Expected: plugin.json says `"version": "0.1.0"`, SKILL.md says `version: 0.1.0`. If they don't match, fix and amend before tagging.

- [ ] **Step 2: Tag the release**

```bash
git tag -a v0.1.0 -m "v0.1.0 — initial release (local distribution only)"
git tag --list
```

Expected: `v0.1.0` appears.

- [ ] **Step 3: Verify final state**

```bash
git log --oneline | head -30
```

Expected: clean linear history of feat/docs/test commits leading to a tagged HEAD.

- [ ] **Step 4: Notify the maintainer**

Tell Gary the skill is ready for internal use and beta-customer selection. Capture the next steps in a follow-up note (suggested location: `docs/superpowers/plans/2026-XX-XX-influxdb3-skill-v1-1.md` once v1.1 scope is brainstormed).

---

## Self-review checklist (run before handing off)

- [ ] Every spec section (Purpose, Layout, SKILL.md, References, Examples, Testing, Risks, Roadmap) maps to at least one task.
- [ ] No "TBD" / "TODO" / "fill in later" left in the plan **except** the explicit `(TBD)` cells in `references/flavor-detection.md` (Task 7), which are documented as open items in the spec and revisited before tagging (Task 25).
- [ ] No "implement appropriate error handling" hand-waving — error handling is spelled out in `references/writing.md` and per-language client refs.
- [ ] Type/method/function names used in later tasks (e.g., `InfluxDBClient3` in Python, `InfluxDBClient` in JS/Go/Java/C#) are consistent with their first appearance.
- [ ] All file paths are absolute or relative-from-repo-root and unambiguous.
- [ ] Each task has a concrete commit step and a verification step.
- [ ] The eval suite (Tasks 21, 22) runs **after** every reference and example exists, and **before** the tag (Task 25).
