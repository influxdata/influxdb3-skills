# InfluxDB 3.12.1 compatibility investigation

Status: interview complete; shared understanding confirmed by the user.
Every main merge must be verified and production-worthy.
Compatibility corrections cover both skills; new capabilities are considered separately.
The baseline groups corrections to both skills in one package release.
No 3.12.1 compatibility certification has been made.

The implementation specification is published as [influxdb3-skills issue #35](https://github.com/influxdata/influxdb3-skills/issues/35), labeled `ready-for-agent`.

## Source baseline

The investigation started on 2026-10-23.
Remote `influxdb3-skills/main` is `e381f15cb9a1d3a6ba42a6aca0c5b6458a0b9019`.
Remote `docs-tooling/main` is `76a18d049ac9f7d6957f1bfc2c03c12b468409e3`.
Both remote heads were checked during this investigation.
GitHub PR metadata establishes merge destinations and dates for docs-v2.

A subsequent remote check found docs-tooling main at `6a8a6967eb03ed28f862f5c8138a7429d6a28581`.
The three newly added 3.12.1 ledger files were read through the GitHub API at that exact commit.
The local docs-tooling main remains at the earlier snapshot; it was not changed.

Both skills currently declare documentation checks against Core and Enterprise 3.11.5.
The package version is 0.7.2.
The compatibility review therefore includes changes since 3.11.5, including the 3.12.0 feature release.

### Required release-note review

Read the target release notes on current docs-v2 `master` and on the production site as additional compatibility cues.
Review 3.12.1 and the intervening 3.12.0 release against the existing 3.11.5 baseline.
PR descriptions alone do not satisfy this review.

- [Enterprise production release notes, 3.12.1](https://docs.influxdata.com/influxdb3/enterprise/release-notes/#v3121).
- [Core production release notes, 3.12.1](https://docs.influxdata.com/influxdb3/core/release-notes/#v3121).
- [Shared release-note source on docs-v2 master](https://github.com/influxdata/docs-v2/blob/master/content/shared/v3-core-enterprise-release-notes/_index.md).
  The Core and Enterprise release-note pages use this shared source.

During the specification clarification, docs-v2 `master` resolved to `a78562c9a0893d9b9f422412a816032a156461d9`.
The shared source and both production 3.12.1 sections were read.
Implementation must refresh the source commit and record production URLs, access date, and release sections reviewed.
It must record the disposition of each cue relevant to existing guidance, follow linked reference/how-to pages, and reconcile the result with the claims ledger and eval coverage.
Any difference between master and production stays explicit.

Release-note cues include streaming error behavior, overwrite corrections, timestamp-bound rejection, and system-table correctness.
Edition and storage-engine qualifiers remain attached to each cue.
The documented overwrite fixes do not by themselves refute the narrower Core duplicate-row observations.
Release notes identify changes; they do not replace the API spec, required live evidence, or separate scope decisions for new capabilities.

## Evidence limits

At the initial docs-tooling snapshot, `research/claims/` contained no 3.12.1-scoped claims.
That gap is partly closed by the subsequently merged ledger entries described below.
The older feature ledger runs cover `3.12.0-0.rc.2` and a 3.12.0 GA rollback investigation.
Confirmed RC behavior does not establish exact-version 3.12.1 verification for claims the new runs do not cover.

The following paths are relative to docs-tooling at the recorded commit:

| Evidence | Relevant findings | Limits |
|---|---|---|
| `research/claims/2026-09-30-influxdb3-skills-3.12-rc2/claims.yml` | Claims 0201–0213 cover schema and plugin API behavior. Claims 0214–0217 leave retry and distributed execution questions unknown. | RC-2, with edition and topology limits per claim. |
| `research/claims/2026-09-30-influxdb3-3.12-rc2-explicit-schema/claims.yml` | Claims 0324–0328 distinguish V3 partial writes from legacy endpoint rejection. Claims 0329–0332 address propagation and plugin writes. | Observed propagation delays are not guaranteed bounds. |
| `research/claims/2026-09-30-influxdb3-3.12-rc2-mcp-write-query-auth/claims.yml` | Claims 0403–0407 cover cross-node behavior, partial writes, and table patch responses. | RC-2 evidence does not certify GA behavior. |
| `research/claims/2026-10-07-enterprise-3.12-three-node-rollback/claims.yml` | Claims 0400–0403 show incompatible catalog records and incorrect query results after catalog-only restoration. | Binary startup does not establish a supported rollback path. |
| `research/work/mcp-trusted-readonly-investigation/phase1-results/` | Raw 3.12.1 results show pre-first-row resource failures returning Core 500 and Enterprise 429. | Promoted in part by the new query/access ledger below. No mid-result failure reproduced. |
| `research/work/mcp-trusted-readonly-investigation/phase2-4-results/` | Raw 3.12.1 results cover scoped-token probes, authorization failures, and ingest-only query routing. | The new query/access ledger qualifies which observations are confirmed. |
| `research/work/mcp-trusted-readonly-investigation/jwt-results/` | Raw Enterprise 3.12.1 role and JWT results. | The new JWT ledger qualifies which observations are confirmed. Hidden commands do not establish public support. |

### Newly merged exact-version claims

At docs-tooling commit `6a8a6967eb03ed28f862f5c8138a7429d6a28581`, these runs contain 51 claims: 46 confirmed and five unknown.
All three runs scope their entries to 3.12.1.
Counts reflect ledger verdicts rather than an independent rerun of the probes.

| Ledger run under `research/claims/` | Claim IDs | Verdicts | Compatibility impact |
|---|---|---|---|
| `2026-10-15-influxdb3-3.12.1-query-and-access/claims.yml` | `claim-20261015-0101` through `0131` | 30 confirmed, one unknown | Exact-version query errors, empty results, scoped access, routing, and query-pool exhaustion. |
| `2026-10-21-enterprise-3.12.1-jwt/claims.yml` | `claim-20261021-0001` through `0017` | 13 confirmed, four unknown | JWT and role observations for existing authentication diagnostics. Role administration remains separate capability work. |
| `2026-10-23-influxdb3-3.12.1-rewritten-point/claims.yml` | `claim-20261023-0001` through `0003` | Three confirmed | Core duplicate-row observations qualify unconditional overwrite and repeated-run safety advice. |

Claims `claim-20261015-0107` and `0108` confirm Core 500 versus Enterprise 429 before the first query row under the tested memory-pool conditions.
The error body is plain text, with no `Retry-After`, across the tested requested result formats.
The probes did not reproduce a failure after rows had started streaming.

Claims `claim-20261015-0113` through `0116` distinguish scoped-token access failures from server reachability.
A denied database and a nonexistent database both produce empty 403 responses under the tested scoped credential.
The same credential can receive 403 on `/ping` and `/health` while permitted queries work.
A filtered database listing shows visible databases, not proof that every unlisted database is absent.

Claim `claim-20261015-0123` confirms data-query 405 responses on an Enterprise ingest-only node.
Claim `0124` remains unknown because decisive output for the claimed `SHOW TABLES` success was not captured.
It also does not establish general `system.*` query behavior.
The earlier broad statement that system-table queries work on ingest-only nodes must not be promoted as confirmed guidance.

The rewrite run confirms two Core observations and a separate Enterprise observation.
Core returned two rows after rewriting the same point, including an observation after fresh 3.12.1 initialization.
Enterprise's seeded tables retained their expected counts after repeated seeds.
Persistence timing and query plans were not captured, so these observations do not establish the cause or a universal deduplication rule.

Existing unconditional overwrite statements in the application `SKILL.md` and `references/schema-design.md` require reconciliation before a 3.12.1 baseline can claim truthful guidance.
The older branch's deterministic-timestamp plugin recommendation cannot by itself guarantee repeated-run safety on Core 3.12.1.
A proposed correction is a bounded observation with its edition, exact version, and uncertainty, plus a link to maintained upstream issue documentation when available.
Broader assertions require further product investigation.

These additions do not close the remaining exact-version evidence requirements for changed write contracts, explicit schemas, plugin file operations, package installation, or distributed trigger execution.

## Merged documentation

| PR | Merge date, UTC | Relevance |
|---|---|---|
| [7818](https://github.com/influxdata/docs-v2/pull/7818), included through [7827](https://github.com/influxdata/docs-v2/pull/7827) | 2026-10-01 | Main 3.12 documentation release. Earlier PR assertions require reconciliation with later evidence. |
| [7822](https://github.com/influxdata/docs-v2/pull/7822) | 2026-10-01 | Product-specific schema modes and endpoint-specific partial writes, with RC evidence. |
| [7850](https://github.com/influxdata/docs-v2/pull/7850) | 2026-10-07 | Processing Engine API defaults, lowercase error values, and asynchronous execution behavior. |
| [7879](https://github.com/influxdata/docs-v2/pull/7879) | 2026-10-14 | 3.12.1 and 3.11 patch notes. Catalog repair and oversized distinct-value-cache fixes belong to 3.11.6, not 3.12.1. |
| [7886](https://github.com/influxdata/docs-v2/pull/7886) | 2026-10-14 | Query-error and cache-limit follow-up. HTTP 429 versus 500 remained unresolved in the PR. |
| [7905](https://github.com/influxdata/docs-v2/pull/7905), [7923](https://github.com/influxdata/docs-v2/pull/7923) | 2026-10-20 | Upgrade order is query, process, compact, ingest. Source review does not establish a live upgrade rehearsal. |
| [7919](https://github.com/influxdata/docs-v2/pull/7919) | 2026-10-22 | Load-capture documentation. Candidate capability expansion rather than a required compatibility correction. |

[7914](https://github.com/influxdata/docs-v2/pull/7914) merged into `jts/docs-3.12-known-issues`, not the default branch.
Its parent [7839](https://github.com/influxdata/docs-v2/pull/7839) remains open at this investigation.
Its live observations can inform claim review, but its merge is not evidence of default-branch documentation.
[7835](https://github.com/influxdata/docs-v2/pull/7835), the rollback correction, also remains open.

## Merge sequence

Each boundary produces verified, production-worthy guidance when it merges to main.
The baseline includes its release preparation and verification in the same PR.

| Merge seam | Included changes | Evidence required before merging |
|---|---|---|
| 1. Gate and release-policy corrections | Enforce full verification for skill-changing merges and individual acceptance of changed-behavior cases. Reconcile exact-version language and example-runner coverage descriptions. | Scorer tests for the changed-case requirement, workflow checks, and repository validation. Re-scoring existing evidence must not be represented as fresh product or agent verification. No skill contents or prompts change in this seam. |
| 2. One 3.12.1 compatibility baseline | Corrections to existing application and plugin guidance together, matching evals, one shared version bump, verification metadata, changelog, eval history, and immutable evidence. | Reviewed exact-version live evidence for changed executable contracts, full final-text release gate, individually passing changed-behavior cases, Core examples, applicable manual Enterprise and plugin checks, matching evidence hashes, and evidence review. |
| Later capability releases | Explicit-schema administration, add-column workflows, expanded role/import guidance, or broader multi-node placement. | Separate scope decision and evidence. Each skill-changing merge gets its own shared version and final-text verification. |

New operational guidance, EDR, and load capture are separate capability decisions.
Their presence in upstream documentation does not require expanding these skills.

### Baseline work groups

These are review groups within the single compatibility PR, not partially verified main merges.

- Query, access, and diagnostics: correct query-error interpretation, distinguish SQL errors from InfluxQL empty results, and avoid treating scoped-token health denials as server unreachability.
- Writes and schema: preserve endpoint-specific partial-write handling where already correct, qualify overwrite claims against Core duplicate-row observations, and correct advice for encountering explicit-schema databases without teaching their administration.
- Processing Engine: correct existing request, installation, runtime, and repeated-execution guidance where needed. Keep distributed placement outside the existing skill boundary.
- Release artifacts: update both manifests and both skill versions together; finalize metadata before measuring and hashing the skills; include the changelog and complete evidence with the baseline PR.

The new query/access and JWT ledgers supply exact-version evidence for their confirmed observations.
The write/schema/plugin contracts still need claim-by-claim coverage analysis and fresh probes wherever the accepted evidence standard is unmet.
Existing correct guidance does not need rewriting merely because a new claim confirms it.
The skills retain only the behavioral distinctions needed for correct decisions and link to the API spec for complete contracts.

### Baseline acceptance

The review includes a release-note coverage record from current docs-v2 `master` and the production Core and Enterprise pages, covering the target and intervening releases.
Each cue relevant to existing guidance has an explained disposition and corresponding claims and eval coverage where needed.
Each changed product claim maps to an exact edition/version and reviewed evidence.
Confirmed observations retain their conditions, and unknown entries are not presented as verified.
The Core rewrite anomaly blocks unconditional overwrite or retry-safety promises; a truthful bounded caveat can describe the observation without asserting an unproven cause or workaround.
Any unresolved behavior that makes the intended correction unsafe blocks that correction from the baseline.

Eval prompts and criteria are reviewed before measurement and remain frozen during it.
Each case runs three times on both agents under the publishing policy.
Claude's aggregate bars and individually required changed-behavior cases must pass under the existing scoring rules.
Codex remains advisory, while demonstrated product or skill defects must be resolved.
Changed-case selection is explicit in the review and evidence; an omitted case cannot count as passing.

Core examples, applicable Enterprise admin lifecycle checks, plugin round trips, and affected troubleshooting demonstrations run against the named versions.
Manual checks include cleanup and their recorded outcomes.
A green Core CI job does not substitute for those checks.

Documentation-check metadata changes only after the named documentation review.
Live-verification metadata changes only after the applicable checks.
No checked-version field changes solely to select a newer CI image.
Both skills' final metadata and shared version are included before generating the final evidence hashes.
Any subsequent skill or prompt change requires matching evidence before merge.

The baseline PR carries the release label so the existing gate runs while the first seam's broader trigger enforcement is being established.
The release tag follows the verified baseline merge under the publishing policy.

## Existing work and release coupling

The local remote-tracking branch `origin/jts/skills-3.12-no-field-tables` contains five commits beyond the merge base with main:

- `714c34b`: application guidance.
- `5c857d6`: plugin repeated-execution guidance.
- `59d9858`: eval additions and cluster-plugin criteria changes.
- `fc930d2`: 0.8.0 release preparation.
- `f117027`: known-issue records and stale-caveat validation.

This branch is starting material, not accepted compatibility evidence.
Its known-issue records mix RC observations and source-only findings.
Its 3.12 version ranges need reconciliation with the exact-version policy.
The docs-tooling friction log records eval failures, harness uncertainty, and rubric changes during measurement in earlier 3.12 work.
Those results do not establish release readiness.

[ADR-0001](decisions/0001-single-package-versioning.md) versions both skills as one package.
[The publishing policy](publishing.md) separates documentation checks from live verification.
The release workflow gates PRs labeled `release`, version tags, and manual dispatches.
Ordinary PRs receive validation checks, with affected local checks required by [TESTING.md](../TESTING.md).

Every edit under `skills/`, including metadata, changes the global `skills_tree` hash.
Every change to `evals/prompts.jsonl` changes the required `prompts_blob` hash.
Final release evidence must match both final hashes.
Each preceding skill-changing main merge also requires the full existing release gate against its final text.
CI exercises Core application examples; it does not establish Enterprise or plugin round-trip coverage.
The publishing policy retains those manual obligations.

README installation instructions use repository sources without an explicit tag.
Each intermediate main state must therefore be verified and production-worthy.
This guarantee is accepted in [ADR-0003](decisions/0003-main-is-a-production-consumption-boundary.md).

## Settled decisions

1. Every merge to main is a production consumption boundary. Clients can pull main and expect truthful guidance.
2. Compatibility corrections cover existing guidance in both skills. New capabilities are considered separately.
3. Changed executable contracts require reviewed exact-version live evidence. Existing raw 3.12.1 results can qualify after review; RC results alone cannot. Descriptive guidance can rely on published documentation, with discrepancies qualified.
4. Skills explain behavior needed for correct use and link to the API spec for complete contracts. They do not duplicate the spec.
5. Each skill-changing merge requires the full existing release gate against its final text, plus applicable Enterprise and plugin checks. Process-only documentation changes require relevant checks.
6. Correct handling of an existing explicit-schema database is compatibility work. Teaching its creation or administration is a separate capability.
7. Changed-behavior eval cases must pass individually under the existing three-run rules, alongside aggregate bars. This includes plugin, admin, and troubleshooting cases. Codex remains advisory, while demonstrated product or skill defects must be resolved.
8. The compatibility baseline corrects both existing skills together in one PR.
9. Every skill-changing merge receives a new shared package version and matching evidence. Process-only changes and internal commits do not each require a package release.

The [glossary](../CONTEXT.md) records the agreed terms.

## Interview state

The decision frontier is empty.
The user confirmed the complete shared understanding at the end of the interview.
This document records the agreed plan; compatibility implementation and certification have not been performed.
Exact file edits, final version magnitude, and which fresh probes are required are implementation findings under the accepted policy, not assumptions of current compatibility.

Prior branch changes are reviewed selectively against the accepted scope and current claims.
Its release version, support ranges, known-issue machinery, expanded routing, and mid-measurement rubric changes do not carry over automatically.

## Gate gaps to resolve

`evals/gate.mjs` scores every case but derives its blocking result only from adversarial, negative, and combined install/connect/write/query/schema/flavor bars.
The `plugins`, `admin`, and `troubleshooting` categories do not contribute to those bars.
The `must_pass` property on prompts is not used by that scorer.
A successful gate therefore does not establish that changed plugin, admin, or troubleshooting behavior passed.

The gate reports Codex results without making them blocking.
That is existing policy, not evidence that a product defect found by Codex is acceptable.
The accepted additional case-level requirement must distinguish product or skill defects from model reliability results.

The workflow selects `evals/evidence/v<plugin-version>/manifest.json`.
The packaging choice must preserve a traceable evidence snapshot for each verified main state.

## Packaging rationale

This repository bundles two skills: `influxdb3` for application work, administration, and troubleshooting; and `influxdb3-plugins` for Processing Engine plugin work.
They share one package version by ADR-0001.
The accepted baseline PR corrects existing guidance in both skills; it does not add a third skill or expand the agreed capability scope.

The [Agent Skills specification](https://agentskills.io/specification#metadata-field) permits optional version metadata but does not prescribe a release cadence or versioning scheme.
[Claude Code's plugin manifest reference](https://code.claude.com/docs/en/plugins-reference#version) says a declared plugin version pins copied installations until that version changes, with exceptions for certain source types.
This makes a package version bump operationally relevant when shipping changed skill contents through this repository's remote plugin distribution.
[Semantic Versioning](https://semver.org/) also requires released version contents to remain immutable.

The accepted policy is one shared version bump per merge that delivers changed skill contents to main, with evidence for that exact state.
Internal commits and process-only repository changes do not each need a package release.
Version magnitude follows the actual scope under the publishing policy, rather than copying the database's 3.12.1 version.
The accepted requirement that every main merge is consumable is what aligns a skill-changing merge with a release here; the Agent Skills format itself does not require that alignment.
