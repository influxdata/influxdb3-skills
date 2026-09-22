# ADR-0001: Version the plugin as one package, not per skill

## Status
Accepted

## Date
2026-09-22

## Context
Early build history (v0.1.0 through v0.5.0, recorded in the now-removed
`docs/superpowers/specs` and `docs/superpowers/plans`) assigned each new
skill or skill extension its own semantic version: `v0.1.0` for the base
`influxdb3` skill, `v0.2.0` when the `influxdb3-plugins` skill was added,
`v0.3.0` for admin/token management, `v0.4.0` for troubleshooting, and so
on. Each release bump tracked one feature area, not the whole plugin.

This worked while the plugin had one skill and a short roadmap, but it
conflates two different things: "a new capability shipped" and "the
distributable package changed." It also implies a support-range reading
(e.g. "v0.3.0 added tokens") that doesn't match how the capability
evidence matrix actually records what's verified — per claim, edition,
and exact version, not per plugin release.

## Decision
Version the plugin as a single package. All bundled skills share one
release version; skills are not versioned independently. See
`docs/release-and-versioning-strategy.md` for the full scheme (release
version vs. capability evidence matrix, milestone table, beta/stable
gates).

## Alternatives Considered

### Per-skill semantic versioning (the original approach)
- Pros: a version bump maps directly to "what feature shipped."
- Cons: doesn't scale past a couple of skills — a release touching two
  skills has no single version to report; a patch to one skill's
  reference doc looks like a feature release if skill-level versions are
  compared; and it duplicates information the evidence matrix already
  carries at finer grain (claim, edition, version).
- Rejected: the evidence matrix is the right place to track "what's
  verified for what," so the release version can stay a single, simple
  package identifier.

## Consequences
- A release note separates packaging changes, documentation-grounded
  capability changes, and live-verified behavior changes, rather than
  relying on the version number to convey which skill changed.
- Do not reintroduce independent per-skill versions, even when only one
  skill changes in a release.
