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
