# ADR-0003: Require production-worthy skill changes before main merges

## Status

Accepted. Records the completed interview and [issue #35](https://github.com/influxdata/influxdb3-skills/issues/35), without reopening its decisions. Amends ADR-0002.

## Decision

Consumers install from main. Every skill-changing main merge must contain a new shared package version and matching immutable evidence before merge. Internal commits and process-only changes do not each require a release.

Deliver two separate PRs:

1. Correct gates and release policy without editing distributed skills or product-behavior prompts.
2. Deliver the 3.12.1 compatibility baseline across both existing skills together, including final versions, truthful metadata, changelog, eval history, and matching evidence. Application, write/schema, plugin, and release-artifact groups are internal review groups, not separately merged partial baselines.

Use the existing harnesses and three-run scoring. Run the full suite on Claude Code and Codex. Claude must meet the existing aggregate bars and every explicitly selected changed-behavior case. Selection includes applicable plugin, admin, and troubleshooting cases and is recorded in the manifest for review. Do not reinterpret historical must-pass markers. Codex scores remain advisory, but missing measurements and demonstrated unresolved defects are not acceptable.

Freeze prompts, criteria, answer models, and judge models during measurement. Finalize versions and metadata before measuring and hashing; later changes require matching evidence. Targeted reruns retain their replacement semantics within the same final content and model configuration.

Map changed executable contracts to reviewed live evidence for the named edition and exact version. Reuse adequate reviewed evidence; probe gaps. Documentation supports descriptive claims. RC observations do not establish final-version compatibility. Record applicable Enterprise lifecycle, Processing Engine round-trip, troubleshooting, and cleanup results before merge. Automated Core examples establish only their own coverage.

Begin compatibility review with current docs-v2 master and production Core/Enterprise release notes, including intervening releases since the recorded baseline. Record source identities, access dates, sections, cues and dispositions, claims, qualifiers, and discrepancies. For this baseline, review both 3.12.0 and 3.12.1. Keep new capabilities separately scoped.

## Enforcement and limits

The existing release workflow detects skill, prompt, evidence, and package changes on main-targeting PRs without requiring a release label. Tags and dispatches also verify. The final `Release gate` check completes for process-only changes and fails on trigger or example failures for verification-required changes. Independent regression tests run on all PRs.

New evidence requires full current Git identities at manifest and result-entry level, full three-run coverage from both agents, visible changed-case selection, and a review record. The scorer rejects failing, missing, unknown, or inadequate selected cases. New skill-changing PRs cannot reuse a main version or its evidence directory, including version/date-only changes.

Code-owner review must judge semantic selection completeness, live-evidence sufficiency, release-note coverage, and unresolved Codex findings. Self-reported measurements are not independently authenticated by CI. Maintainers must require `Release gate`, `Gate regression tests`, existing validation checks, and code-owner review in main protection. This PR does not modify repository settings.

The gate/policy PR needs repository and focused regression checks, not new product/model measurements of unchanged distributed guidance. Historical evidence remains historical and cannot satisfy a new baseline. Tags follow verified main merges; they do not repair earlier verification gaps.
