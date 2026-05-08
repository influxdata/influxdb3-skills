# Publishing / Releasing this Skill

Local-only for v1. These steps describe the release flow, so that v1.1 and beyond go cleanly even before public distribution.

## Per-release checklist

1. **Bump versions in three places:**
   - `.claude-plugin/plugin.json` `version`
   - `skills/influxdb3/SKILL.md` frontmatter `version`
   - `skills/influxdb3/SKILL.md` frontmatter `last_verified` (today's date)

2. **Update `verified_against:`** in `SKILL.md`. For each official client, look up the current minor version on its GitHub releases page and pin to it. Sources:
   - https://github.com/InfluxCommunity/influxdb3-python
   - https://github.com/InfluxCommunity/influxdb3-js
   - https://github.com/InfluxCommunity/influxdb3-go
   - https://github.com/InfluxCommunity/influxdb3-java
   - https://github.com/InfluxCommunity/influxdb3-csharp

3. **Re-run runnable examples** against a live instance (Core + at least one Cloud flavor):

   ```bash
   for d in skills/influxdb3/examples/{python,javascript,go,java,csharp,http}; do
     echo "==> $d"
     # See README or hello.* in this folder for run instructions
   done
   ```

4. **Re-run the smoke tests** (see `evals/smoke-prompts.md`).

5. **Re-run the formal eval suite** (see `evals/README.md`). Block on:
   - Adversarial pass rate < 100%
   - Aggregate triggering+routing pass rate < 90%

6. **Update `CHANGELOG.md`** with the new version's `Added` / `Changed` / `Fixed` / `Deprecated` / `Removed` sections.

7. **Update `docs/eval-history.md`** with the new run's per-category pass rates.

8. **Commit and tag:**

   ```bash
   git add -A
   git commit -m "chore: release v0.X.Y"
   git tag v0.X.Y
   ```

9. **(Future, when public)** Push the tag and announce.

## Quarterly refresh (even with no feature work)

Once per quarter, even if the skill hasn't changed:

1. Rerun all examples and the eval suite.
2. Update `last_verified` and `verified_against:` to current.
3. Open an issue for any client-version-driven breakage and fix.

## When a client ships a breaking change

Subscribed to release feeds for the five clients? Good. When a breaking change drops:

1. Update the relevant `references/clients/<lang>.md` and `examples/<lang>/`.
2. Add a smoke prompt that exercises the changed area.
3. Bump the patch version (or minor if the skill's behavior visibly changes).
4. Run the per-release checklist.

## v0.2.0+ extras (Processing Engine plugins skill)

When releasing a version that includes plugin-skill changes:

1. **Bump versions in three places:**
   - `.claude-plugin/plugin.json` `version` (the plugin's own version)
   - `skills/influxdb3-plugins/SKILL.md` frontmatter `version` and `last_verified`
   - `skills/influxdb3-plugins/SKILL.md` frontmatter `verified_against.influxdb3_pe_runtime` to the actual server version tested

2. **Re-run the five plugin example round-trips** against a known-good live instance:
   - `examples/wal/` — write to `sensors_demo`, check log + `processed_summary`
   - `examples/scheduled/` — wait one tick, check log + `scheduled_heartbeat`
   - `examples/request/` — `curl /api/v3/engine/echo` GET + POST + bad-JSON, check log
   - `examples/cache_counter/` — wait two ticks, check counter increments in log + `plugin_counter`
   - `examples/multifile_alert/` — write below + above threshold, check `alert` measurement

   For each, `influxdb3 delete trigger --force` after verification to leave the instance clean.

3. **Re-run the new smoke prompts (#13–#17)** in fresh Claude Code sessions per the existing smoke-test process.

4. **Re-run the formal eval suite** including the 10 new v0.2.0 prompts. Adversarial pass rate must be 100%.

5. **Update `docs/eval-history.md`** with per-category pass rates including the new categories (`plugins`, plus the new entries in `adversarial` and `negative`).
