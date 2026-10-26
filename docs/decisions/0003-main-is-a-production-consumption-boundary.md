# ADR-0003: Treat every main merge as a production consumption boundary

## Status

Accepted

## Date

2026-10-23

## Decision

Every merge to `main` must provide verified, production-worthy guidance because a client can pull `main` directly.
A later release PR or tag cannot supply verification missing at an earlier merge.
This requires more verification at merge boundaries than treating `main` as staging for a final certified release.

The InfluxDB 3.12.1 compatibility review covers corrections to existing guidance in both bundled skills.
New capabilities receive separate scope and release decisions.

Changed executable contracts require reviewed live evidence for the exact edition and version, including request bodies, status codes, writes, and trigger behavior.
Existing raw 3.12.1 results can qualify after review; RC evidence alone cannot.
Published documentation can support descriptive guidance, with discrepancies explicitly qualified.
The skills explain behavior needed for correct use and link to the API spec for complete contracts instead of duplicating it.

Each skill-changing merge requires the full existing release gate against its final text, plus applicable Enterprise and plugin checks.
Process-only documentation changes require relevant checks.
Changed-behavior eval cases must also pass individually under the existing three-run rules, including cases outside the aggregate gate categories.
Claude Code and Codex results gate equally.

Corrections for encountering an explicit-schema database are compatibility work.
Teaching users to create or administer explicit schemas is a separate capability.

The compatibility baseline merges corrections to `influxdb3` and `influxdb3-plugins` together in one PR.
Every skill-changing merge receives a new shared package version and matching immutable evidence.
Internal commits and process-only repository changes do not each need a package release.
Version magnitude follows the change scope under the existing publishing policy.

Gate and release-policy corrections can merge first with relevant verification because they do not change distributed skill contents.
The compatibility PR includes its version bump, truthful verification metadata, changelog, and evidence before merge.
It does not rely on a later release-preparation PR for production readiness.
