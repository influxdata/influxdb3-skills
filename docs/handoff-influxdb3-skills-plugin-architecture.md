# Handoff: InfluxDB 3 skills plugin, architecture and release strategy

Written 2026-09-22.

Use the content plan and the findings
below as inputs to the skills plugin's architecture and release
strategy. **Don't start implementing the content plan.**

## Inputs to read first (not duplicated here)

| Artifact | What it holds |
|---|---|
| `/Users/ja/.claude/plans/build-a-plan-1-functional-bunny.md` | The unapproved content and eval plan. It has six steps: triage the release notes, restructure the skill, review with skill-creator, build the eval, extend the runner, run it live. User decisions already folded in: run **Claude and Codex**; grading is **collaborative** (I propose, the user decides, and both are recorded as grader training data). |
| docs-tooling `docs/exec-plans/active/0005-influxdb3-skill-3.11.5-and-3.12-readiness.md` | The working plan. Phase 0 is done: testbench on 3.11.5, drift fix, both editions observed. It also holds the 2a write-path findings, the MCP gap (P1b), stale client pins, the docs discrepancy, and Phase 3 (version range plus smoke/full gate) and Phase 4 (validator, smoke script, eval runner). |
| docs-tooling `research/work/release-3.11.5/observations/` | Verbatim 3.11.5 write-behavior evidence and the probe script. |
| docs-tooling `research/work/release-3.11.5/PLAN.md` | The release-triage ledger from an earlier session. |
| docs-tooling `HANDOFF.md` (untracked) | The original cross-agent rename handoff. Plan 0005 supersedes it, but its rename inventory is still the best one. |
| MCP repo `~/influxdata/influxdb3_mcp_server`, branch `docs/mcp-3.11-patch-plan` | `.docs/mcp-3.11/patch-1.4.1-spec.md` (P1b added, header refreshed in `13e1a46`), `verification-questions.md` (A1–A4 resolved), `AGENT_E2E_TESTS.md`, `e2e-results/*.yaml`. |

Commits from this session:
- **docs-tooling**, branch `skill-ent3.12`, not pushed: `d1207ad`, `828cfbd`, `cc04296`, `77a44f1`, `f9bcd89`, `d01d427`.
- **Skill repo:** `495686b`.
- **MCP repo:** `13e1a46`.

## Current state of the plugin

| Fact | Value |
|---|---|
| Repo | `influxdata/claude-skill-for-influxdb3`; local `/Users/ja/worktrees/dev-sessions/skill-ent3.12/claude-influxdb3`, branch `skill-ent3.12` |
| Packaging | `.claude-plugin/plugin.json`: `claude-influxdb3` 0.4.2. `.claude-plugin/marketplace.json`: marketplace `influxdata`, `source: "./"`, no version field. |
| Skills | `influxdb3` (SKILL.md 219 lines, 13 references, 6 client references, examples) and `influxdb3-plugins` (163 lines, 9 references) |
| Frontmatter | `name`, `description`, `version`, `last_verified: 2026-05-08`, `verified_against` (core and enterprise 3.8; python 0.19, js 2.2, go 2.14, java 1.9, csharp 1.8). `version`, `last_verified` and `verified_against` are not in the Agent Skills spec. |
| Evals | `evals/prompts.jsonl`: 53 prompts, all `must_pass`. Categories: negative 10, adversarial 9, connect 7, query 5, plugins 5, schema 4, write 4, admin 4, troubleshooting 3, flavor 2. `evals/smoke-prompts.md`, four `reviewer-briefings/`, `results/`. **No runner script.** `docs/eval-history.md` is referenced but missing. |
| Release gate | `docs/publishing.md`: 9 manual steps plus per-version extras. There's no CI, no `package.json`, and no test of any kind. |
| MCP awareness | Only `SKILL.md:42` ("stands alone… complements" the MCP server). Neither the docs MCP nor `influxdb3_mcp_server` is named as a lookup source. |
| Coverage gaps | Nothing on upgrades, PachaTree, 3.11 `--pt-*` or env var renames, or `--user-auth-type`. The skill still claims Cloud coverage, which the README withdrew (plan 0005 §2d). |

## Findings that should shape the architecture

### 1. Version contract and release cadence
- Core and Enterprise ship patches every few weeks. docs-v2 lists 29 releases from 3.8.0 to 3.11.5, with parallel 3.9.x, 3.10.x and 3.11.x patch lines. The skill sat at 3.8 for 4.5 months because every bump paid the full feature gate.
- Plan 0005 already chose two things: a supported **range** (`>=3.8 <=3.11.5`, plus `last_verified_exact`) and a **tiered gate**. Smoke runs on a patch bump; the full gate runs on a minor.
- **Unresolved:** where version facts live. The SKILL.md bodies are version-silent, which is a good property; keep it. Version-specific behavior goes in references, each fact tied to the release that introduced it.
- **Example of a version fact the sources disagree on:** duplicate tag keys. Release notes list the rejection fix in 3.9.8 and 3.10.3 (backports) as well as 3.11.0. The user said 3.11.0. The skill now says "from 3.11.0". This must be resolved from the sources before the range floor is honest.

### 2. Cross-agent portability
- The goal is to follow the Agent Skills spec and be tested on Claude **and** Codex.
- **Things that tie it to Claude:**
  - the repo name;
  - the plugin name `claude-influxdb3`;
  - the `.claude-plugin/` directory;
  - about 14 "Claude" mentions in skill text;
  - top-level frontmatter fields that aren't in the spec. The spec-conformant fix is to move them under `metadata:`. `docs/publishing.md:9-10` depends on the current paths, and nothing would catch the break.
- **Open decisions:** the new names, and whether `.claude-plugin/` stays as one of several distribution channels.
- **Codex runner status:** the testbench builds `codex exec --profile … --json`. Whether Codex can load a skill from `.agents/skills/` in that role has not been checked.

### 3. Relationship to the MCP server (`influxdb3_mcp_server`)
- **Division of labor:** the skill teaches what to do and why. The MCP server does live operations and reports what happened.
- **Rule the user set this session:** runtime replies report the server's facts, verbatim, and never interpret them. The MCP reply must not say "the rest were written". Explaining what each mode does belongs in the skill.
- **Consistency points:** duplicate-tag and partial-write replies (P1b), the stopped-node answer (A1 is a TCP failure, not a 503), and the error shapes (A2–A4, which match on 3.11.0 and 3.11.5).
- **Eval sharing verdict:** adapt, don't share wholesale.
  - Borrow the runner, the result YAML schema, the recording template and the case-table shape.
  - Share only a few cross-cutting cases, each run with the skill alone and with the skill plus MCP.
  - The MCP-only prompts forbid shell, so they would stop the skill from working.

### 4. Where the model looks for answers (the "teach where to look" goal)
- **Lookup order:**
  1. InfluxDB docs MCP (`search_influxdata_knowledge_sources`).
  2. `influxdb3_mcp_server` for live state.
  3. The curated `references/doc-urls.md` URLs.
- **The docs MCP is reliable for client-library facts.** This session it returned the v2-by-default change for every official client, with versions (python 0.20, csharp 1.9, go 2.15; go 2.14 defaulted to `write_lp`).
- **The docs MCP did not know** when `accept_partial=true` became the default. Live probes and the user filled that gap.
- The repo rule added in `.agents/instructions/verification.md` (`cc04296`) says to search the docs and release notes before asking the user.

### 5. Eval and runner infrastructure (for the release gate design)
- **`claire/testbench`** (`pnpm testbench`) runs `claude -p` or `codex exec` in a sandboxed `testbench` role against the live Core and Enterprise containers.
  - Cases live in `claire/testbench/e2e-manifest.yaml`.
  - Results are `passed | interrupted | needs_review`, with **no `failed` state**.
  - It records facts: tool path, failed calls, tokens, a secret-leak scan, and whether shell was used.
  - Raw output goes to `~/.cache/claire/testbench/<date>/`; durable results go to `reports/testbench/`.
  - The role sets **`skills: []`**, so mounting the skill needs a role change.
- **`research/schemas/verify-deterministic.mjs`** runs command and endpoint checks under ADR 0018 accounting: `ran` plus `verdict`, and a 401 counts as `unknown`, never as a pass.
- **Tokens and ports:**
  - token files are `~/.influxdb3-{core,enterprise}-admin-token.json` and the enterprise permission-tokens file;
  - env vars are set by `claire/agent-task/src/index.ts`;
  - Core is on 8282; Enterprise is on 8181, 8183 and 8184;
  - **no token values are in this doc.**
- **The testbench is on 3.11.5** (`828cfbd`). `ensure-test-service` now recreates stale containers (`d1207ad`).
- Core has a **limit of 5 databases**. Probe databases must be cleaned up, or writes fail with 422.

### 6. Release-notes tooling reliability (for gate automation)
- **Usable:** docs-v2 published notes, `content/shared/v3-core-enterprise-release-notes/_index.md` on `origin/master`. The docs-v2 worktree is in the session scratchpad, which is gone next session; recreate it with `git -C ~/gh/influxdata/docs-v2 worktree add --detach <dir> origin/master`.
- **`npx docs release-notes`:** the generated v3.11.5 notes don't match the published section. The explorer inferred a wrong commit range; that is not verified. Don't feed them to a gate without fixing that.
- **`npx docs audit` is stale:**
  - The API audit expects `api-docs/…/v3/ref.yml`, which is now `influxdb3-core-openapi.yaml`, and reports 0% coverage.
  - The Enterprise audit crashes: `influxdb_pro` is now a monorepo with `ent/` and `oss/`.
  - The Enterprise CLI report is identical to Core's, which looks wrong.
- **`derive diff`**, v3.11.0 to v3.11.5:
  - Core: no command changes.
  - Enterprise: added `cleanup-parquet` and `retry-upgrade-to-pacha-tree`.
- **`scripts/openapi/build.sh`** builds the public specs from the hand-maintained `internal/enterprise-openapi-merged.yaml`, not from derive output. Derive output only validates it. A rebuild changes only `x-source-hash`, so "the public spec is unchanged" proves nothing about the API.
- **Docs-v2 issues to file:**
  - "NEEDS VERIFICATION" comments at lines 347 and 424, and a `TOKIO_CONSOLE` note at line 336, in the published release notes;
  - the `accept_partial=false` error string (docs say `"parsing failed for write_lp endpoint"`; 3.11.5 returns `"line protocol parsing error"`).

## Details for increment planning

A candidate order to review, not a decision.

1. **Architecture decisions:**
   - names and distribution channels;
   - where frontmatter metadata lives;
   - the version contract;
   - how the skill relates to the MCP server.
   - Check each against the ADR bar in `docs/adrs/README.md` (hard to reverse, surprising, a real trade-off). The range-vs-pin contract probably qualifies.
2. **Guardrails before content:**
   - a frontmatter and link validator (plan 0005 §4.1; it would have caught the `(v0.4.0)` versus `0.4.2` body mismatch);
   - URL checks for both `doc-urls.md` files;
   - a check that the plugin and skill versions agree.
3. **Runner:**
   - skill mount in the testbench role;
   - a skill manifest;
   - a `failed` state;
   - collaborative grading fields (`proposed`, `result`, `grader_notes`);
   - Codex skill loading, checked before relying on it.
4. **Content increments,** each followed by a skill-creator review:
   - (a) routing and lookup;
   - (b) upgrades and serve config;
   - (c) writes, auth and plugins.
5. **Eval run on 3.11.5,** then `docs/eval-history.md` and the release.
6. **3.12 RC triage** once the machinery exists. RC images are quay.io only, tagged by SHA, and need the base compose file. `.config/test-mapping.yaml` `pre_release` still has v3.11.0 SHAs (plan 0005 0.4 is blocked).

Constraints the user has stated:
- Lessons go in skills, hooks or rules, not agent memory.
- Look things up with tools before asking; use the InfluxDB docs MCP.
- Record verdicts nobody observed as absent, never as passing.
- Runtime messages report facts and don't interpret them.
- Don't push, and don't change branches the user owns, without being asked.

## Loose ends in the working tree
- **docs-tooling has uncommitted Phase 3 OpenAPI output:**
  - 3 modified files under `reports/openapi/`;
  - 2 new files: `internal/*-v3.11.5-openapi.yaml`.
  - They add nothing over `main` beyond the hash. **Ask before discarding.**
- **Another session's files, don't touch:** `claire/README.md`, `claire/bin/launch-derive.sh`, `claire/test/launch-derive.test.sh`, `research/work/derive-documentation-audit/`.
- **derive is built** at `derive/target/release/derive`. `bin/derive` is a symlink to it, but not on PATH. Set `DERIVE_BIN`. Mirrors are in `.cache/`.
- **Live containers are running:** Core and the 3-node Enterprise cluster on 3.11.5.

## Suggested skills
- `exec-plans`: to fold this into plan 0005 or start a new exec plan for the architecture work.
- `agent-skills:spec-driven-development` or `superpowers:brainstorming`: to settle the architecture before any code.
- `agent-skills:planning-and-task-breakdown`: to split it into increments.
- `agent-skills:documentation-and-adrs`, with `docs/adrs/README.md`: for the naming, version-contract and MCP-boundary decisions.
- `writing-for-agents` and `skill-creator:skill-creator`: for skill structure, and the review step after each content pass.
- `agent-skills:api-and-interface-design`: for the skill/MCP boundary.
- `influxdb-testbench` and `influxdb-docker-testing`: to run anything live.
- `git-workflow`: before commits.
