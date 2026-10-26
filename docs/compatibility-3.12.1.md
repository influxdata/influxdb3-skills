# InfluxDB 3.12.1 compatibility plan

Status: plan accepted. No 3.12.1 compatibility certification has been made.
The specification is [influxdb3-skills issue #35](https://github.com/influxdata/influxdb3-skills/issues/35).
The cue-by-cue review is in [releases/3.12.1-review.md](releases/3.12.1-review.md).
Reasons for individual skill changes are in [CHANGELOG.md](../CHANGELOG.md).

## Baseline

Both skills declare documentation checks against Core and Enterprise 3.11.5, at package version 0.7.2.
The review therefore covers 3.12.0 and 3.12.1.

Sources checked on 2026-10-23:

- `influxdb3-skills/main`: `e381f15cb9a1d3a6ba42a6aca0c5b6458a0b9019`.
- docs-tooling `main`: `6a8a6967eb03ed28f862f5c8138a7429d6a28581`, which holds the 3.12.1 ledger runs.
- docs-v2 `master`: `a78562c9a0893d9b9f422412a816032a156461d9`.

### Release-note review

Read the 3.12.1 and 3.12.0 notes on docs-v2 `master` and on the production site:

- [Enterprise release notes, 3.12.1](https://docs.influxdata.com/influxdb3/enterprise/release-notes/#v3121).
- [Core release notes, 3.12.1](https://docs.influxdata.com/influxdb3/core/release-notes/#v3121).
- [Shared release-note source](https://github.com/influxdata/docs-v2/blob/master/content/shared/v3-core-enterprise-release-notes/_index.md), used by both pages.

Record the source commit, access date, and a disposition for each cue relevant to existing guidance.
Keep edition and storage-engine qualifiers.
Release notes identify changes; they don't replace the API spec or required live evidence.

## Evidence

Claim IDs refer to InfluxData's internal verification ledger.

| Ledger run | Claims | Limits |
|---|---|---|
| 2026-09-30, RC-2 skills | `claim-20260930-0201`–`0217` | RC-2 only. |
| 2026-09-30, RC-2 explicit schema | `claim-20260930-0324`–`0332` | RC-2 only. |
| 2026-09-30, RC-2 MCP write, query, auth | `claim-20260930-0403`–`0407` | RC-2 only. |
| 2026-10-07, Enterprise 3.12 rollback | `claim-20261007-0400`–`0403` | No supported rollback path. |
| 2026-10-15, 3.12.1 query and access | `claim-20261015-0101`–`0131` | 30 confirmed, one unknown. |
| 2026-10-21, Enterprise 3.12.1 JWT | `claim-20261021-0001`–`0017` | 13 confirmed, four unknown. |
| 2026-10-23, 3.12.1 rewritten point | `claim-20261023-0001`–`0003` | Cause unresolved. |
| 2026-10-24, 3.12.1 compatibility probes | `claim-20261024-*` | See CHANGELOG. |

RC evidence does not certify 3.12.1.

## Merged documentation

| PR | Merged (UTC) | Relevance |
|---|---|---|
| [7818](https://github.com/influxdata/docs-v2/pull/7818)–[7827](https://github.com/influxdata/docs-v2/pull/7827) | 2026-10-01 | Main 3.12 documentation release. |
| [7822](https://github.com/influxdata/docs-v2/pull/7822) | 2026-10-01 | Schema modes and endpoint-specific partial writes. |
| [7850](https://github.com/influxdata/docs-v2/pull/7850) | 2026-10-07 | Processing Engine API defaults and error values. |
| [7879](https://github.com/influxdata/docs-v2/pull/7879) | 2026-10-14 | 3.12.1 and 3.11 patch notes. Catalog repair belongs to 3.11.6. |
| [7886](https://github.com/influxdata/docs-v2/pull/7886) | 2026-10-14 | Query-error and cache-limit follow-up. |
| [7905](https://github.com/influxdata/docs-v2/pull/7905), [7923](https://github.com/influxdata/docs-v2/pull/7923) | 2026-10-20 | Upgrade order. |
| [7919](https://github.com/influxdata/docs-v2/pull/7919) | 2026-10-22 | Load capture. Capability work, not compatibility. |

[7914](https://github.com/influxdata/docs-v2/pull/7914), [7839](https://github.com/influxdata/docs-v2/pull/7839), and [7835](https://github.com/influxdata/docs-v2/pull/7835) are not on the default branch.

## Merge sequence

| Seam | Changes | Evidence before merge |
|---|---|---|
| 1. Gate and release policy | Full verification for skill-changing merges; individual acceptance of changed-behavior cases. | Scorer tests, workflow checks, repository validation. |
| 2. 3.12.1 compatibility baseline | Corrections to both skills, matching evals, one version bump, metadata, changelog, eval history, evidence. | Exact-version live evidence for changed contracts, full release gate, Core examples, applicable Enterprise and plugin checks. |
| Later capability releases | Explicit-schema administration, add-column, role and import guidance, multi-node placement. | Separate scope and evidence. |

### Baseline acceptance

The review covers docs-v2 `master` and the production Core and Enterprise pages for the target and intervening releases.
Documentation updates continuously, so a reviewed commit or page read is a snapshot, not complete documentation for the version.
Each changed product claim maps to an exact edition, version, and reviewed evidence.
Unknown claims are not presented as verified.
The Core duplicate-row observation blocks unconditional overwrite or retry-safety promises.

Eval prompts and criteria are frozen during measurement.
Each case runs three times on Claude Code and Codex.
Both agents must pass the aggregate bars and every required changed-behavior case.
An omitted case doesn't count as passing.

Core examples, applicable Enterprise admin checks, plugin round trips, and affected troubleshooting demonstrations run against the named versions, with cleanup recorded.
A green Core CI job doesn't substitute for those checks.

Verification metadata changes only after the matching review or check.
Final metadata and version are in place before the evidence hashes are generated.
Any later skill or prompt change needs matching evidence before merge.

## Settled decisions

1. Every merge to main is a production consumption boundary. See [ADR-0003](decisions/0003-main-is-a-production-consumption-boundary.md).
2. Compatibility corrections cover existing guidance in both skills. New capabilities are separate.
3. Changed executable contracts need reviewed exact-version live evidence. RC results alone don't qualify.
4. Skills explain behavior needed for correct use and link to the API spec for complete contracts.
5. Each skill-changing merge needs the full release gate against its final text, plus applicable Enterprise and plugin checks.
6. Handling an existing explicit-schema database is compatibility work. Administering explicit schemas is a separate capability.
7. Changed-behavior eval cases must pass individually under the three-run rules, alongside the aggregate bars.
8. Claude Code and Codex gate equally.
9. The baseline corrects both skills in one PR.
10. Every skill-changing merge gets a new shared package version and matching evidence. Process-only changes don't.

The [glossary](../CONTEXT.md) records the agreed terms.

## Packaging

Both skills share one package version ([ADR-0001](decisions/0001-single-package-versioning.md)).
A declared plugin version pins copied installations until it changes ([Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference#version)), so changed skill contents need a version bump.
Version magnitude follows the change scope, not the database version.
