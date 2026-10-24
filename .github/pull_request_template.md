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
- full final-content eval suite, three runs per case on both agents; selected changed-case IDs
- iteration-only eval cases rerun: `node evals/run-codex-evals.mjs --case <id> --runs 3`
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
- [ ] Product claims cite the docs-tooling claims ledger, with edition, exact version, and evidence state

For skill-changing PRs before merge:

- [ ] New shared package version, changelog, and eval history included
- [ ] Final-content full-suite evidence from both agents, three runs per case
- [ ] Manifest selects every changed-behavior case, or explains no changed behavior
- [ ] Release-note coverage and exact-version live evidence reviewed; applicable Enterprise/plugin/troubleshooting outcomes and cleanup recorded
- [ ] Codex findings reviewed and demonstrated defects resolved
- [ ] Verification metadata reflects completed checks; Core CI coverage is not claimed as Enterprise or Processing Engine verification
