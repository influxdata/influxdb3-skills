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

For any skill change that states or relies on product behavior, cite the
claim IDs from the docs-tooling verification claims ledger
(`research/claims/<run-id>/claims.yml`), for example `claim-20260925-0188`.
If no claim covers the behavior, record one there first, and add the skill
lines to the claim's `cites`.
-->

Claims:

## Checklist

- [ ] Signed the [InfluxData CLA](https://www.influxdata.com/legal/cla/) (if necessary)
- [ ] Rebased/mergeable
- [ ] Skills validate: `uvx --from <skills-ref> skills-ref validate skills/<skill>/` (see `.github/workflows/validate.yml`)
- [ ] Versions match: `scripts/check-versions.sh`
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] Product claims cite the docs-tooling claims ledger, with version support written as `X+`
