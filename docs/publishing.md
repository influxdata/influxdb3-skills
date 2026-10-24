# Releasing the skills

## When to release

The release notes for InfluxDB 3 Core and Enterprise are the cue to review the skills.
Use the published InfluxDB 3 release notes, or pre-release notes when they're available before publication.
Scope each update by what changed, not by the database version: a patch release can change behavior.

Main is a production consumption boundary. Complete this checklist before every skill-changing merge, including changes to versions or verification dates. A later tag cannot supply missing verification. Process-only changes do not require a package release.

All skills share the plugin version ([ADR-0001](decisions/0001-single-package-versioning.md)).

- **Patch:** corrections that don't change skill boundaries or expected agent behavior.
- **Minor:** changes to boundaries, routing, or triggers, or a new capability.

## Evidence rules

- Trust the InfluxData docs until observed behavior on a named edition and exact version contradicts them.
- `--help` text shows which flags a binary accepts. Its descriptions and defaults aren't evidence against the docs; settle those conflicts with a behavior test or an engineering consult.
- Use release notes to find changes, not as the only source for stable guidance.
- When a discrepancy is confirmed, fix the docs, the skill, and the InfluxDB 3 MCP server, not only the skill.
- Record each changed product claim in the claims ledger with edition, version, source, and evidence state (Documented, Live-verified, Derived, Unknown).
- Don't write support ranges such as `>=3.8`. Record the exact versions checked, and note the version where behavior changed.

## Update for an InfluxDB release

1. Begin with target Core and Enterprise release notes on current docs-v2 master and production. Resolve master to a commit and record production URLs, access date, sections reviewed, and relevant cues since the recorded baseline. For 3.12.1, include 3.12.0 because the existing baseline is 3.11.5. Record each relevant cue as a correction, already handled, or separately scoped work. Preserve master/production discrepancies, edition and storage-engine qualifiers, and links to maintained reference/how-to pages.
2. For each change, read the reference and how-to pages in docs-v2 (`content/`), including their version annotations.
3. Match each change against the claims ledger: confirmed, refuted, unknown, or stale.
4. Map every changed executable contract to reviewed live evidence for its edition and exact version. Reuse adequate reviewed evidence; run bounded probes for uncovered contracts and record them in the claims ledger. Documentation supports descriptive guidance but does not replace runtime evidence. RC observations do not establish final-version behavior. Keep documented, observed, derived, and unknown results distinct.
5. Update the skills. Don't hardcode version-sensitive values.
6. Map changed behaviors to existing eval cases where adequate; add cases only for uncovered behavior. List each changed-behavior case in the evidence manifest for individual acceptance.
7. Run the full formal suite on both agents, three runs per case, on final contents. Keep prompts, criteria, answer models, and judge models fixed during measurement. Review disagreements instead of lowering acceptance to hide failures.
8. File docs, InfluxDB 3 MCP server, and skill defects.
9. Release with the checklist below.

## Per-release checklist

1. **Assign a new shared package version for this skill-changing merge.** Finalize it before measuring. Bump everywhere it appears. `scripts/check-versions.sh` checks that they match:
   - `plugin.json` and `.claude-plugin/plugin.json` `version`
   - `metadata.version` in each `skills/*/SKILL.md`

2. **Update the verification metadata** under `metadata:` in each `SKILL.md`:
   - `docs_checked` and `docs_checked_against`: the date and exact InfluxDB 3 versions whose docs and release notes you checked.
   - `live_verified`: the date you last checked claims against live instances, including verified claims from the docs-tooling ledger. Change it only after that check.
   - `live_verified_against`: record only the edition and exact versions actually checked after applicable live checks complete. Do not advance it based on text evals, RC evidence, or a Core-only example run. Leave truthful older metadata until new verification is complete.
   - `clients_verified_against` (`influxdb3` skill): record the client versions actually exercised after their checks complete. Consult release pages to select candidates; looking up a version does not verify it. Sources:
   - https://github.com/InfluxCommunity/influxdb3-python
   - https://github.com/InfluxCommunity/influxdb3-js
   - https://github.com/InfluxCommunity/influxdb3-go
   - https://github.com/InfluxCommunity/influxdb3-java
   - https://github.com/InfluxCommunity/influxdb3-csharp

3. **Re-run runnable examples** against the manifest's exact Core target. Also run applicable Enterprise lifecycles, Processing Engine round trips, and affected troubleshooting demonstrations against their named exact versions. Record outcomes and cleanup before merge. The managed cloud environment is available for development and additional testing outside CI. CI Core coverage does not establish Enterprise or Processing Engine correctness:

   ```bash
   for d in skills/influxdb3/examples/{python,javascript,go,java,csharp,http}; do
     echo "==> $d"
     # See README or hello.* in this folder for run instructions
   done
   ```

4. **Re-run the smoke tests** (see `evals/smoke-prompts.md`).

5. **Re-run the formal eval suite** on the final skill text (see `evals/README.md`), 3 runs per case, on Claude Code and Codex. Run `scripts/check-paths.sh --fix` on the result files, then commit them and `manifest.json` to `evals/evidence/v0.X.Y/`. `node evals/gate.mjs` must pass for Claude Code:
   - Adversarial pass rate < 100% blocks the release.
   - Negative, or install, connect, write, query, schema, and flavor combined, below 90% blocks the release.
   - Every selected changed-behavior case must pass individually, including plugin, admin, and troubleshooting cases. Omitted or unknown selections cannot pass.
   - Codex scores remain advisory; full three-run measurements are required. Report findings and resolve demonstrated defects before merge.

   A code owner of `evals/evidence/` reviews the changed-case selection, release-note coverage, applicable live evidence, cleanup, and Codex findings before approving the skill-changing PR, and the release-gate workflow checks the evidence.

6. **Update `CHANGELOG.md`.** Separate packaging changes, documentation-grounded changes, and live-verified behavior changes.

7. **Update `docs/eval-history.md`** with the new run's per-category pass rates.

8. **Commit the verified PR:**

   ```bash
   git add -A
   git commit -m "chore: release v0.X.Y"
   ```

9. **Create and push the version tag** only after the verified main merge. Keep the compatibility-baseline PR release-labeled during the transition. Configure main protection to require `Release gate`, `Gate regression tests`, existing validation checks, and code-owner review. Workflow files cannot configure these repository settings.

## Quarterly refresh (even with no feature work)

Once per quarter, even if the skill hasn't changed:

1. Rerun all examples and the eval suite.
2. Update the verification metadata in each `SKILL.md`.
3. Open an issue for any client-version-driven breakage and fix.

## When a client ships a breaking change

Subscribed to release feeds for the five clients? Good. When a breaking change drops:

1. Update the relevant `references/clients/<lang>.md` and `examples/<lang>/`.
2. Add a smoke prompt that exercises the changed area.
3. Bump the patch version (or minor if the skill's behavior visibly changes).
4. Run the per-release checklist.

## v0.2.0+ extras (Processing Engine plugins skill)

When releasing a version that includes plugin-skill changes:

1. **Bump `.claude-plugin/plugin.json` `version` and update `skills/influxdb3-plugins/SKILL.md` `metadata:`** as in the per-release checklist. Update live-verification fields only after the applicable checks complete, with edition and exact versions as described above.

2. **Re-run the five plugin example round-trips** against the named edition and exact version:
   - `examples/wal/` — write to `sensors_demo`, check log + `processed_summary`
   - `examples/scheduled/` — wait one tick, check log + `scheduled_heartbeat`
   - `examples/request/` — `curl /api/v3/engine/echo` GET + POST + bad-JSON, check log
   - `examples/cache_counter/` — wait two ticks, check counter increments in log + `plugin_counter`
   - `examples/multifile_alert/` — write below + above threshold, check `alert` measurement

   For each, `influxdb3 delete trigger --force` after verification to leave the instance clean.

3. **Re-run the new smoke prompts (#13–#17)** in fresh agent sessions per the existing smoke-test process.

4. **Re-run the formal eval suite** including the 10 new v0.2.0 prompts. Adversarial pass rate must be 100%.

5. **Update `docs/eval-history.md`** with per-category pass rates including the new categories (`plugins`, plus the new entries in `adversarial` and `negative`).

## v0.3.0+ extras (admin / DB + token management)

When releasing a version that includes `influxdb3` skill admin changes:

1. **Bump versions and metadata** as in the per-release checklist.

2. **Pre-release orphan check** (mandatory):

   ```bash
   export PATH="$HOME/.influxdb:$PATH"
   influxdb3 show databases --format json | python3 -c "import json,sys; data=json.load(sys.stdin); print('db orphans:', [d['iox::database'] if isinstance(d, dict) else d for d in data if 'admin_test_' in str(d)])"
   influxdb3 show tokens --format json | python3 -c "import json,sys; data=json.load(sys.stdin); print('token orphans:', [t['name'] for t in data if 'admin_test_' in t.get('name','')])"
   ```

   Both lists must be empty before the release lifecycle re-runs. If anything's left over, manually `influxdb3 delete database <name>` and `influxdb3 delete token --token-name <name>` to clean up.

3. **Re-run the six admin lifecycle examples** against the live instance: `examples/admin-http`, `examples/admin-python`, `examples/admin-javascript`, `examples/admin-go`, `examples/admin-java`, `examples/admin-csharp`. Each must reach "Done. Lifecycle completed cleanly."

4. **Post-release orphan check** (mandatory): same as step 2; both lists must again be empty. Failures here block the main merge.

5. **Re-run smoke prompts (#18–#22)** in fresh agent sessions per the existing process.

6. **Re-run formal eval suite** including the 8 new admin prompts. Adversarial pass rate must be 100%.

## v0.4.0+ extras (troubleshooting)

When releasing a version that includes troubleshooting changes:

1. **Bump versions and metadata** as in the per-release checklist.

2. **Pre-release orphan check** (mandatory; broadened to include troubleshooting demo patterns):

   ```bash
   export PATH="$HOME/.influxdb:$PATH"
   for pattern in admin_test_ senor_data_ diagnose_; do
     echo "=== orphans matching $pattern ==="
     influxdb3 show databases --format json | python3 -c "
import json, sys
dbs = [d['iox::database'] for d in json.load(sys.stdin)]
print([d for d in dbs if d.startswith('$pattern')])
"
     influxdb3 show tokens --format json | python3 -c "
import json, sys
data = json.load(sys.stdin)
print([t['name'] for t in data if t.get('name', '').startswith('$pattern')])
"
   done
   ```

   All three lists must be empty before the release lifecycle re-runs. If anything's left over, manually delete via the appropriate CLI command (`influxdb3 delete database <name>` or `influxdb3 delete token --token-name <name>`).

3. **Re-run the diagnostic toolkit** at `examples/diagnose/`. Expected: clean health report, no warnings, ends with "Done. (Full health: OK)".

4. **Re-run the five broken→fix demo pairs** at `examples/troubleshooting/`. For each pair: verify the broken version exhibits the documented wrong-behavior, the fixed version produces the correct behavior, and any test resources are cleaned up. The `silent_auto_create` demo creates a real `senor_data_<ts>` database — manually clean it up after the run.

5. **Post-release orphan check** (mandatory): same as step 2; all three lists must again be empty. Failures here block the main merge.

6. **Re-run smoke prompts (#23–#27)** in fresh agent sessions, with special attention to #27 (the customer-pasted token redaction case).

7. **Re-run formal eval suite** including the 6 new troubleshooting prompts. Adversarial pass rate must be 100%.

## Merge evidence format

New evidence must use this format. Historical manifests are not grandfathered into new skill-changing merges. Use full Git object IDs from the final committed `skills/` tree and `evals/prompts.jsonl` blob. Every result entry must identify those same inputs and name the fixed answer and judge models. Do not reuse mismatched measurements, including for version/date-only edits.

```json
{
  "release": "v0.X.Y",
  "core_version": "3.12.1",
  "skills_tree": "<git rev-parse HEAD:skills, full ID>",
  "prompts_blob": "<git rev-parse HEAD:evals/prompts.jsonl, full ID>",
  "required_cases": ["<each case covering changed behavior>"],
  "review_record": "review.md",
  "claude": [{
    "file": "claude-full-suite.json",
    "runs": 3,
    "model": "<answer model>",
    "judge": "<judge model>",
    "skills_tree": "<same full ID>",
    "prompts_blob": "<same full ID>"
  }],
  "codex": [{
    "file": "codex-full-suite.json",
    "runs": 3,
    "model": "<answer model>",
    "judge": "<judge model>",
    "skills_tree": "<same full ID>",
    "prompts_blob": "<same full ID>"
  }]
}
```

Keep result files and the review record inside this version directory. For a change with no behavioral impact, explicitly use `required_cases: []` and a `no_changed_behavior` explanation. Reviewers must check that the selection covers all changed behavior; CI cannot infer semantic omissions.

The review record must include:

- Changed behaviors, selected case IDs, and rationale for any empty selection.
- Release-note coverage with the docs-v2 master commit, production URLs and access date, reviewed sections, relevant cues and dispositions, linked references, claim IDs, and discrepancies.
- For each changed executable contract, edition, exact version, claim/run reference, reviewed outcome, and cleanup. Include applicable Enterprise lifecycles, plugin round trips, and troubleshooting demonstrations. Explain inapplicable checks rather than counting them as passes.
- Codex findings, judge disagreements, demonstrated defects and their resolutions, remaining model reliability misses, and material limitations.

`core_version` selects the automated example image. It does not change either skill's documentation-check or live-verification metadata. A nonempty review record is structurally required; its adequacy, provenance, and truthfulness require code-owner review. CI validates evidence structure and content identities, not authenticity of self-reported runs.
