<!--
Write plainly and clearly.
Use short sentences and active voice, and avoid jargon.
A reviewer should understand the change without opening the diff.
-->

Closes #

## What changed

## Why

## Impact

<!-- to skill users (agents and developers) or repo consumers -->

## Verification

<!--
List what you ran and the result. Examples:
- live example runs, with product and version (for example, Core 3.11.5)
- eval cases rerun: `node evals/run-codex-evals.mjs --case <id> --runs 3`
  or `claude plugin eval ./ --case <id>`
-->

## Checklist

- [ ] Signed the [InfluxData CLA](https://www.influxdata.com/legal/cla/) (if necessary)
- [ ] Rebased/mergeable
- [ ] Skills validate: `uvx --from <skills-ref> skills-ref validate skills/<skill>/` (see `.github/workflows/validate.yml`)
- [ ] Versions match: `scripts/check-versions.sh`
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] Product claims checked against docs or a live instance, with version support written as `X+`
