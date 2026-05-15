# InfluxDB 3 Plugins Skill — TOML Config Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coverage of InfluxDB 3 Processing Engine's built-in TOML plugin config to the `claude-influxdb3` skill (v0.4.2 → v0.5.0), closing the long-standing deferral in `SKILL.md` line 151.

**Architecture:** Eight additive, sequenced commits to `~/Projects/claude-influxdb3/` on `main`. Each commit either adds files or appends to existing files — no deletions except the one deferral line in `SKILL.md`. TDD-style: the new eval prompt (Task 1) defines the success criteria, then Tasks 2–6 build out the docs and example that satisfy it, then Tasks 7–8 close out version bump + changelog. Final verification in Task 9 runs the existing smoke gate (must still pass 29/29) plus syntax checks on the new example files.

**Tech Stack:** Markdown, Python 3.11+ (`tomllib` for verification only — the example plugin does NOT import it), TOML. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-influxdb3-plugins-toml-config-design.md` (commit `48be064`).

---

## Working Directory

All paths in this plan are relative to `~/Projects/claude-influxdb3/`. The first command of every task is `cd ~/Projects/claude-influxdb3/`.

---

## File Structure

**Created:**
- `skills/influxdb3-plugins/examples/toml_config/example_toml_config.py` — scheduled-trigger plugin (one file, ~30 lines), demonstrates `args` arriving with native Python types
- `skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml` — TOML config (~15 lines), scalars + one nested table
- `skills/influxdb3-plugins/examples/toml_config/README.md` — walkthrough (~40 lines), matches the style of `examples/scheduled/README.md`

**Modified:**
- `evals/smoke-prompts.md` — append new `## v0.5.0 scope coverage` mini-section with prompt #30 (eval row)
- `skills/influxdb3-plugins/references/plugin-structure.md` — append new section "Plugin configuration via TOML" after the existing "Plugin metadata docstring" section
- `skills/influxdb3-plugins/references/triggers-cli.md` — add a 2–3 line note + cross-link in the `--trigger-arguments` row (currently line 18)
- `skills/influxdb3-plugins/SKILL.md` — remove deferral line 151; bump §11 header from `(v0.4.0)` to `(v0.5.0)`; bump frontmatter `version:` `0.4.2` → `0.5.0`; update `last_verified:` to `2026-05-15`
- `plugin.json` — bump `"version": "0.4.2"` → `"0.5.0"`
- `CHANGELOG.md` — prepend `## 0.5.0 — 2026-05-15` entry

---

### Task 1: Add eval prompt as success-criteria spec

**Files:**
- Modify: `evals/smoke-prompts.md` (append new mini-section at end)

The eval prompt is the test for the new coverage. Adding it first locks in the bar that the rest of the work must clear.

- [ ] **Step 1: Verify the existing tail of `evals/smoke-prompts.md`**

```bash
cd ~/Projects/claude-influxdb3/
tail -20 evals/smoke-prompts.md
```

Expected: file currently ends with the v0.4.1 scope section (prompts #28, #29) and their hard-block / deferred-cases subsections.

- [ ] **Step 2: Append the new mini-section to `evals/smoke-prompts.md`**

Append exactly the following at the end of the file (preserve a single blank line above the new `##` heading):

````markdown

---

## v0.5.0 scope coverage — TOML plugin config

| # | Prompt | Verifies | Pass criteria |
|---|---|---|---|
| 30 | "I want my plugin to read its threshold from a TOML file instead of hard-coding it. How do I wire that up?" | TOML config mechanism, `config_file_path` arg, `PLUGIN_DIR` location, engine-side parsing, native-type preservation | Mentions `--trigger-arguments config_file_path=<filename.toml>` on `influxdb3 create trigger`; places the TOML file in `PLUGIN_DIR` alongside the `.py`; explicitly notes the engine parses the TOML (NO `tomllib` call in the plugin); notes that TOML values arrive in `args` with native Python types (int/float/bool/list/dict), not as strings; mentions the InfluxData house naming convention `<plugin>_config_<trigger_type>.toml` as recommended; points at `examples/toml_config/` for a complete working example. |

### v0.5.0 hard-block cases

- Claude must NOT tell the developer to import `tomllib` (or `tomli` / `toml`) inside the plugin — the engine handles parsing.
- Claude must NOT invent a TOML loading mechanism not on the canonical docs path (e.g., auto-discovery by filename, env-var-driven paths beyond `PLUGIN_DIR`).

### v0.5.0 deferred cases (must defer politely)

- TOML / inline `--trigger-arguments` precedence: undocumented upstream. Skill should say so and point at the canonical InfluxData example repo for empirical answers.
````

- [ ] **Step 3: Run a sanity check on the added markdown**

```bash
cd ~/Projects/claude-influxdb3/
grep -c "^| 30 |" evals/smoke-prompts.md
```

Expected output: `1`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add evals/smoke-prompts.md
git commit -m "$(cat <<'EOF'
test: add v0.5.0 eval prompt for TOML plugin config

Prompt #30 locks in the success criteria for the upcoming TOML
config coverage. Hard-blocks against the wrong-mental-model trap
(importing tomllib inside the plugin) and the made-up-mechanism
trap. Deferred-cases note flags the precedence ambiguity that
upstream docs leave unresolved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected output: one new commit on `main`, one file changed, no other files staged.

---

### Task 2: Create the example plugin folder

**Files:**
- Create: `skills/influxdb3-plugins/examples/toml_config/example_toml_config.py`
- Create: `skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml`
- Create: `skills/influxdb3-plugins/examples/toml_config/README.md`

- [ ] **Step 1: Verify the parent folder layout**

```bash
cd ~/Projects/claude-influxdb3/
ls skills/influxdb3-plugins/examples/
```

Expected: five existing folders (`cache_counter`, `multifile_alert`, `request`, `scheduled`, `wal`). The new `toml_config/` folder will live alongside.

- [ ] **Step 2: Create the example Python plugin file**

Create `skills/influxdb3-plugins/examples/toml_config/example_toml_config.py` with exactly this content:

```python
"""
Example: TOML-config scheduled plugin.

Activate with:
  influxdb3 create trigger \\
    --database mydb \\
    --plugin-filename example_toml_config.py \\
    --trigger-spec "every:10s" \\
    --trigger-arguments config_file_path=example_toml_config_scheduler.toml \\
    toml_demo

The engine reads the TOML alongside this file and merges its keys into args.
No tomllib import here — the engine handled the parsing before this function
was called.
"""


def process_scheduled_call(influxdb3_local, call_time, args=None):
    threshold = args["threshold"]              # int, not str — TOML preserved the type
    severity_levels = args["severity_levels"]  # dict from a [severity_levels] table
    label = args.get("label", "demo")

    influxdb3_local.info(
        f"[{label}] threshold={threshold} ({type(threshold).__name__}); "
        f"warn_above={severity_levels['warn']}, "
        f"alert_above={severity_levels['alert']}"
    )
```

- [ ] **Step 3: Verify the Python compiles**

```bash
cd ~/Projects/claude-influxdb3/
python3 -m py_compile skills/influxdb3-plugins/examples/toml_config/example_toml_config.py
```

Expected: no output, exit code 0. If you see a `SyntaxError`, fix the source and re-run.

- [ ] **Step 4: Create the TOML config file**

Create `skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml` with exactly this content:

```toml
# Example TOML config consumed by example_toml_config.py.
#
# The InfluxDB 3 Processing Engine loads this file when the trigger is
# created with --trigger-arguments config_file_path=example_toml_config_scheduler.toml
# and merges its keys into the args dict passed to process_scheduled_call.

# Threshold for alerting (int, not a string — the engine preserves TOML types)
threshold = 75

# Optional label included in log output
label = "demo-trigger"

# Nested table — comes through as a Python dict in args["severity_levels"]
[severity_levels]
warn = 70
alert = 90
```

- [ ] **Step 5: Verify the TOML parses**

```bash
cd ~/Projects/claude-influxdb3/
python3 -c "import tomllib; cfg = tomllib.load(open('skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml', 'rb')); print(cfg)"
```

Expected output (exact):

```
{'threshold': 75, 'label': 'demo-trigger', 'severity_levels': {'warn': 70, 'alert': 90}}
```

If the dict shape differs, the TOML is wrong — fix and re-run.

- [ ] **Step 6: Create the example README**

Create `skills/influxdb3-plugins/examples/toml_config/README.md` with exactly this content:

````markdown
# Example: TOML-Config Scheduled Plugin

A minimal scheduled-trigger plugin that reads its configuration from a TOML file. Demonstrates the InfluxDB 3 Processing Engine's built-in TOML loading — the plugin does **not** import `tomllib`; the engine handles parsing before `process_scheduled_call` is invoked.

## What it does

On every tick of the scheduled trigger, the plugin logs a single line at info-level showing:

- the `threshold` (an `int`, with its type proven via `type().__name__`)
- the `label` (a `str`)
- the nested `severity_levels.warn` and `severity_levels.alert` thresholds (from a TOML `[severity_levels]` table that arrives as a Python `dict`)

No queries, no writes — the goal is purely to make TOML-to-args delivery observable.

## Install and run

Both files must live under your `PLUGIN_DIR` on the InfluxDB 3 host. With `example_toml_config.py` and `example_toml_config_scheduler.toml` in place:

```bash
influxdb3 create trigger \
  --database mydb \
  --plugin-filename example_toml_config.py \
  --trigger-spec "every:10s" \
  --trigger-arguments config_file_path=example_toml_config_scheduler.toml \
  --token "$INFLUXDB_TOKEN" \
  toml_demo
```

## Verify it fired

Query `system.processing_engine_logs` after the first tick:

```sql
SELECT * FROM system.processing_engine_logs
WHERE trigger_name = 'toml_demo'
ORDER BY event_time DESC
LIMIT 5;
```

You should see a row whose message looks like:

```
[demo-trigger] threshold=75 (int); warn_above=70, alert_above=90
```

The `(int)` is the receipt that the engine preserved the TOML type rather than stringifying it.

## Things to notice

- **The plugin never imports `tomllib`.** The engine parses the TOML before invoking your entry-point. Keep your plugin code dependency-free of any TOML library.
- **Native types come through.** `threshold` is an `int`, `severity_levels` is a `dict`, not strings. This is the practical reason to prefer TOML over inline `--trigger-arguments key=val` (which always arrive as strings).
- **`config_file_path` is `PLUGIN_DIR`-relative.** Pass just the filename, not an absolute path, unless your operator wants to opt into a non-standard layout.
- **House naming convention:** `<plugin_base>_config_<trigger_type>.toml`. The engine doesn't enforce it — `config_file_path` accepts any filename — but matching the InfluxData convention makes plugins easier to recognize and lets you ship separate TOMLs for a single plugin's multiple trigger types (e.g., scheduled + data-writes).
````

- [ ] **Step 7: Verify the README's heredoc fences are balanced**

```bash
cd ~/Projects/claude-influxdb3/
awk '/^```/{c++} END{print c " fence(s); expected even"}' skills/influxdb3-plugins/examples/toml_config/README.md
```

Expected: an even number, ≥ 4.

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add skills/influxdb3-plugins/examples/toml_config/
git commit -m "$(cat <<'EOF'
feat(examples): add toml_config scheduled-trigger example

Minimal scheduled plugin demonstrating built-in TOML config:
- example_toml_config.py — process_scheduled_call that reads
  threshold (int), label (str), and a nested severity_levels
  table (dict) directly from args, with no tomllib import.
- example_toml_config_scheduler.toml — scalars + one nested
  table, follows the InfluxData house naming convention.
- README.md — install/verify walkthrough, "things to notice"
  list anchored on engine-side parsing and native-type
  preservation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected output: one new commit, three new files.

---

### Task 3: Add "Plugin configuration via TOML" section to `plugin-structure.md`

**Files:**
- Modify: `skills/influxdb3-plugins/references/plugin-structure.md` (append after the existing "Plugin metadata docstring" section, before the final "Where to fetch more" section)

- [ ] **Step 1: Confirm the insertion point**

```bash
cd ~/Projects/claude-influxdb3/
grep -n "^## " skills/influxdb3-plugins/references/plugin-structure.md
```

Expected output (the heading layout you should see — line numbers may differ slightly):

```
5:## Single-file plugin
35:## Multi-file plugin
79:## When to use which
84:## Plugin metadata docstring (informational)
92:## Where to fetch more
```

The new section goes BETWEEN `## Plugin metadata docstring (informational)` and `## Where to fetch more`.

- [ ] **Step 2: Insert the new section**

Using the Edit tool, find the exact line `## Where to fetch more` in `skills/influxdb3-plugins/references/plugin-structure.md` and replace it with this block (the new section + a blank line + the original `## Where to fetch more` line):

````markdown
## Plugin configuration via TOML

InfluxDB 3 loads TOML config files for you. Pass `config_file_path=<filename>` as one of the `--trigger-arguments` when creating the trigger, and the engine reads the TOML and merges its keys into the `args` dict your entry-point function receives. **Do not import `tomllib` in your plugin** — the parsing happens before your code runs.

### File location

The TOML file must live under the directory your InfluxDB 3 host has configured as `PLUGIN_DIR` (the same directory holding your `.py` file). The value passed to `config_file_path` is resolved relative to `PLUGIN_DIR`:

```bash
--trigger-arguments config_file_path=my_plugin_config_scheduler.toml
```

Absolute paths and paths outside `PLUGIN_DIR` are not supported.

### Naming convention (recommended)

The InfluxData house style for the official plugin library is:

```
<plugin_base>_config_<trigger_type>.toml
```

Examples (from `influxdata/influxdb3_plugins/influxdata/basic_transformation/`):

- `basic_transformation_config_scheduler.toml`
- `basic_transformation_config_data_writes.toml`

Different file per trigger type because different entry points (`process_scheduled_call` vs `process_writes`) typically want different schemas. The engine doesn't enforce this naming — `config_file_path` accepts any filename — but following the convention makes plugins easier for downstream developers to recognize.

### Worked example

A scheduled plugin reading a threshold from TOML:

```python
# my_plugin.py
def process_scheduled_call(influxdb3_local, call_time, args=None):
    threshold = args["threshold"]        # int, not str
    label = args.get("label", "default")
    influxdb3_local.info(f"[{label}] threshold={threshold}")
```

```toml
# my_plugin_config_scheduler.toml
threshold = 75
label = "demo"
```

Create the trigger with:

```bash
influxdb3 create trigger \
  --database mydb \
  --plugin-filename my_plugin.py \
  --trigger-spec "every:1m" \
  --trigger-arguments config_file_path=my_plugin_config_scheduler.toml \
  --token "$INFLUXDB_TOKEN" \
  my_plugin_trigger
```

### Native types are preserved

This is the practical reason to prefer TOML over inline `--trigger-arguments key=val`:

| Source | Value of `args["threshold"]` | Type |
|---|---|---|
| TOML: `threshold = 75` | `75` | `int` |
| Inline: `--trigger-arguments threshold=75` | `"75"` | `str` |

TOML tables become Python `dict`s, arrays become `list`s, booleans become `bool`. No casting required in the plugin — `int(args["threshold"])` is unnecessary (and counterproductive) when the value comes from TOML.

### Complete worked example

See `skills/influxdb3-plugins/examples/toml_config/` for a runnable scheduled-trigger plugin with a matching TOML, install commands, and verification queries.

### When in doubt

For canonical real-world examples of TOML config in production InfluxData plugins, see the official repo's `influxdata/` directory: https://docs.influxdata.com/influxdb3/enterprise/plugins/library/

## Where to fetch more
````

- [ ] **Step 3: Verify the section was inserted correctly**

```bash
cd ~/Projects/claude-influxdb3/
grep -n "^## " skills/influxdb3-plugins/references/plugin-structure.md
```

Expected output: six section headings now, with `## Plugin configuration via TOML` appearing between `## Plugin metadata docstring (informational)` and `## Where to fetch more`.

- [ ] **Step 4: Verify no broken cross-link to the example**

```bash
cd ~/Projects/claude-influxdb3/
ls skills/influxdb3-plugins/examples/toml_config/
```

Expected: three files (`README.md`, `example_toml_config.py`, `example_toml_config_scheduler.toml`).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add skills/influxdb3-plugins/references/plugin-structure.md
git commit -m "$(cat <<'EOF'
docs(plugin-structure): add Plugin configuration via TOML section

Documents the built-in config_file_path mechanism:
- activation via --trigger-arguments
- PLUGIN_DIR-relative file location
- InfluxData house naming convention (recommended)
- worked example pairing .py + .toml + create-trigger command
- explicit table showing TOML int vs inline-string typing
- cross-link to examples/toml_config/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit, one file changed, +50 to +80 lines.

---

### Task 4: Add cross-link to `triggers-cli.md`

**Files:**
- Modify: `skills/influxdb3-plugins/references/triggers-cli.md` (extend the `--trigger-arguments` row's description)

- [ ] **Step 1: Locate the `--trigger-arguments` row**

```bash
cd ~/Projects/claude-influxdb3/
grep -n "trigger-arguments k=v" skills/influxdb3-plugins/references/triggers-cli.md
```

Expected: a single hit, on or near line 18, of the form:

```
18:| `--trigger-arguments k=v,k2=v2` | no | Comma-separated key=value pairs passed to the plugin as `args`. All values arrive as strings. |
```

- [ ] **Step 2: Extend that row**

Using the Edit tool, replace the exact line:

```
| `--trigger-arguments k=v,k2=v2` | no | Comma-separated key=value pairs passed to the plugin as `args`. All values arrive as strings. |
```

with:

```
| `--trigger-arguments k=v,k2=v2` | no | Comma-separated key=value pairs passed to the plugin as `args`. All values arrive as strings. **For typed values from a TOML file**, pass `config_file_path=<filename.toml>` — see `references/plugin-structure.md` → "Plugin configuration via TOML". |
```

- [ ] **Step 3: Verify the edit**

```bash
cd ~/Projects/claude-influxdb3/
grep -c "config_file_path" skills/influxdb3-plugins/references/triggers-cli.md
```

Expected output: `1`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add skills/influxdb3-plugins/references/triggers-cli.md
git commit -m "$(cat <<'EOF'
docs(triggers-cli): cross-link --trigger-arguments to TOML config

Pointer from the create-trigger flag table to the new
plugin-structure.md section, so developers who start at the CLI
reference (rather than the structure reference) still discover
the config_file_path mechanism.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit, one file changed, one line modified.

---

### Task 5: Remove deferral and bump version in `SKILL.md`

**Files:**
- Modify: `skills/influxdb3-plugins/SKILL.md` (delete one line, edit frontmatter, edit one section header)

- [ ] **Step 1: Confirm the current frontmatter and deferral line**

```bash
cd ~/Projects/claude-influxdb3/
head -25 skills/influxdb3-plugins/SKILL.md
echo "---"
grep -n "TOML config files for plugins" skills/influxdb3-plugins/SKILL.md
echo "---"
grep -n "What this skill does NOT cover" skills/influxdb3-plugins/SKILL.md
```

Expected:
- Frontmatter shows `version: 0.4.2` and `last_verified: "2026-05-08"`
- The TOML deferral line is at line 151 (or close — the exact line may have shifted slightly)
- The §11 header reads `## 11. What this skill does NOT cover (v0.4.0)`

- [ ] **Step 2: Bump the frontmatter `version`**

Using the Edit tool, in `skills/influxdb3-plugins/SKILL.md` replace:

```
version: 0.4.2
```

with:

```
version: 0.5.0
```

- [ ] **Step 3: Bump the frontmatter `last_verified`**

Using the Edit tool, in `skills/influxdb3-plugins/SKILL.md` replace:

```
last_verified: "2026-05-08"
```

with:

```
last_verified: "2026-05-15"
```

- [ ] **Step 4: Bump the §11 header**

Using the Edit tool, in `skills/influxdb3-plugins/SKILL.md` replace:

```
## 11. What this skill does NOT cover (v0.4.0)
```

with:

```
## 11. What this skill does NOT cover (v0.5.0)
```

- [ ] **Step 5: Remove the TOML deferral bullet**

Using the Edit tool, in `skills/influxdb3-plugins/SKILL.md` replace:

```
- **TOML config files for plugins** → "v0.3.0+ covers TOML config patterns."
```

with the empty string (i.e., remove the line entirely; do not leave a blank gap if the surrounding lines are adjacent bullets).

If a blank line remains where the bullet was, remove it so the deferral list stays tight.

- [ ] **Step 6: Verify all four edits landed**

```bash
cd ~/Projects/claude-influxdb3/
head -25 skills/influxdb3-plugins/SKILL.md | grep -E "version:|last_verified:"
echo "---"
grep -c "TOML config files for plugins" skills/influxdb3-plugins/SKILL.md
echo "---"
grep "What this skill does NOT cover" skills/influxdb3-plugins/SKILL.md
```

Expected:
- `version: 0.5.0` and `last_verified: "2026-05-15"`
- `0` (deferral bullet is gone)
- `## 11. What this skill does NOT cover (v0.5.0)`

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add skills/influxdb3-plugins/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skill): bump to v0.5.0, drop TOML deferral

- frontmatter version 0.4.2 -> 0.5.0
- last_verified -> 2026-05-15
- §11 deferral header -> (v0.5.0)
- remove "TOML config files for plugins -> v0.3.0+" bullet;
  replaced by actual coverage in plugin-structure.md and
  examples/toml_config/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit, one file changed, four small edits.

---

### Task 6: Bump version in `plugin.json` and add CHANGELOG entry

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Confirm the current `plugin.json` version**

```bash
cd ~/Projects/claude-influxdb3/
grep '"version"' .claude-plugin/plugin.json
```

Expected: `  "version": "0.4.2",`

- [ ] **Step 2: Bump `plugin.json`**

Using the Edit tool, in `.claude-plugin/plugin.json` replace:

```
  "version": "0.4.2",
```

with:

```
  "version": "0.5.0",
```

- [ ] **Step 3: Confirm the current `CHANGELOG.md` top entry**

```bash
cd ~/Projects/claude-influxdb3/
head -5 CHANGELOG.md
```

Expected: top entry is for v0.4.2 (or whatever the most recent shipped version is).

- [ ] **Step 4: Prepend the new CHANGELOG entry**

Using the Edit tool, find the first existing `## ` heading in `CHANGELOG.md` (likely `## 0.4.2 — ...`) and prepend the new entry above it. Concretely, replace the existing first heading line with the new block + the original heading. If the first heading is, for example:

```
## 0.4.2 — 2026-05-08
```

replace it with:

```
## 0.5.0 — 2026-05-15

### Added
- **Plugin configuration via TOML** — `references/plugin-structure.md` now documents the built-in `config_file_path` mechanism: the engine loads a TOML file from `PLUGIN_DIR` and merges its keys into the `args` dict passed to the plugin entry-point, preserving native types.
- New `examples/toml_config/` example: a scheduled-trigger "threshold notifier" plugin with a matching TOML file, demonstrating scalar values, nested tables, and the InfluxData `<plugin>_config_<trigger_type>.toml` naming convention.
- Short cross-link from `references/triggers-cli.md` (in the `--trigger-arguments` section) pointing at the new TOML coverage.
- New eval prompt #30 in `evals/smoke-prompts.md` covering the TOML config mechanism, with hard-blocks against the wrong-mental-model trap (importing `tomllib` inside the plugin) and the made-up-mechanism trap.

### Removed
- Deferral note "TOML config files for plugins → v0.3.0+ covers TOML config patterns" from `SKILL.md` — replaced by actual coverage.

## 0.4.2 — 2026-05-08
```

(Adjust the date on the existing `## 0.4.2 ...` line to match whatever is actually there — do not change it.)

- [ ] **Step 5: Verify both edits**

```bash
cd ~/Projects/claude-influxdb3/
grep '"version"' .claude-plugin/plugin.json
echo "---"
head -3 CHANGELOG.md
```

Expected:
- `  "version": "0.5.0",`
- The CHANGELOG starts with `# Changelog` (or similar top-of-file header) followed by `## 0.5.0 — 2026-05-15`

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/claude-influxdb3/
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: bump plugin.json + CHANGELOG to v0.5.0

Records the TOML plugin config coverage as the v0.5.0 release
(minor bump; net-new capability the skill previously deferred).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit, two files changed.

---

### Task 7: Final automated verification

This task is the close-the-loop check. No file changes — just commands that prove the prior tasks landed correctly.

**Files:** none modified.

- [ ] **Step 1: Confirm all version strings agree at 0.5.0**

```bash
cd ~/Projects/claude-influxdb3/
grep -rE 'version[":[:space:]]+["]?0\.[0-9]+\.[0-9]+' .claude-plugin/plugin.json skills/influxdb3-plugins/SKILL.md CHANGELOG.md | head -10
```

Expected: each of those three files contains `0.5.0` at its version marker. No stragglers showing `0.4.2`.

- [ ] **Step 2: Confirm the TOML deferral line is gone**

```bash
cd ~/Projects/claude-influxdb3/
grep -c "TOML config files for plugins" skills/influxdb3-plugins/SKILL.md
```

Expected: `0`

- [ ] **Step 3: Confirm the example files parse and compile**

```bash
cd ~/Projects/claude-influxdb3/
python3 -m py_compile skills/influxdb3-plugins/examples/toml_config/example_toml_config.py && \
python3 -c "import tomllib; tomllib.load(open('skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml', 'rb'))" && \
echo "OK"
```

Expected output: `OK`

- [ ] **Step 4: Confirm the eval prompt landed**

```bash
cd ~/Projects/claude-influxdb3/
grep "^| 30 |" evals/smoke-prompts.md
```

Expected: a single line with prompt #30 about reading a threshold from a TOML file.

- [ ] **Step 5: Confirm only intended files changed since v0.4.2**

```bash
cd ~/Projects/claude-influxdb3/
git log --name-only 48be064..HEAD | grep -E "^[^ ]" | sort -u
```

Expected file list (commits since the spec was committed):

```
.claude-plugin/plugin.json
CHANGELOG.md
evals/smoke-prompts.md
skills/influxdb3-plugins/SKILL.md
skills/influxdb3-plugins/examples/toml_config/README.md
skills/influxdb3-plugins/examples/toml_config/example_toml_config.py
skills/influxdb3-plugins/examples/toml_config/example_toml_config_scheduler.toml
skills/influxdb3-plugins/references/plugin-structure.md
skills/influxdb3-plugins/references/triggers-cli.md
```

If any other file shows up, investigate before continuing.

- [ ] **Step 6: View the cumulative diff for one final eyeball**

```bash
cd ~/Projects/claude-influxdb3/
git diff 48be064..HEAD --stat
```

Expected: 8–9 files changed, mostly additions; only `SKILL.md` shows a deletion (the deferral line).

This task has no commit — it's a verification gate.

---

### Task 8: Manual smoke gate (user-driven)

The skill's eval suite is manual — each prompt is run in a fresh Claude Code session. This task is **not** runnable by an automated agent. It is a gate the user (or a reviewer) runs themselves.

**Files:** none modified.

- [ ] **Step 1: Pause and hand off to the user**

The implementing agent should stop here and tell the user:

> "Automated verification (Task 7) passed. The manual smoke gate is next — run prompts #1–#29 in fresh sessions (must still pass), plus the new prompt #30 (must pass for v0.5.0 release). Record results in `evals/results/smoke-<date>.md` following the existing pattern. Ping me when you have the results."

- [ ] **Step 2: When the user reports back, decide release path**

If 29 original prompts still pass AND new prompt #30 passes: ship v0.5.0 (next agent action: tag the release per the repo's existing tagging convention — check `git tag` for the format used by v0.4.2).

If any prompt regresses: stop. Open an issue, do NOT release. The regression must be triaged before v0.5.0 ships.

If new prompt #30 fails: the docs content needs work. Iterate on `plugin-structure.md` (Task 3), re-run prompt #30, repeat until pass. Each iteration gets its own commit.

This task has no commit.

---

## Self-Review

After writing this plan, checked against the spec:

**Spec coverage:**
- §1 Purpose & Scope → Task 5 (deferral removal) + Task 6 (version bump + CHANGELOG)
- §2 Canonical Mechanism → Task 3 (doc section content reflects the verified facts)
- §3 File Plan → Tasks 1–6 cover all 3 created + 5 modified files
- §4 Doc Section Outline → Task 3 implements the 8-point outline
- §5 Example Plugin Design → Task 2 implements the three files
- §6 Versioning & CHANGELOG → Task 5 (SKILL.md frontmatter + §11 header) + Task 6 (plugin.json + CHANGELOG.md)
- §7 Verification → Task 7 (automated) + Task 8 (manual smoke gate)
- §8 Open Questions → Default decisions baked in (verified_against stays at 3.8; naming convention phrased as recommended). No additional task needed.
- §9 Risk & Mitigation → Task 8 handoff explicitly checks for smoke-gate regression.

No gaps found.

**Placeholder scan:** No "TBD", "TODO", "implement later", "add appropriate", or "similar to Task N" anywhere. Each task has concrete file paths, full content, and exact commands.

**Type/identifier consistency:**
- `config_file_path` used consistently in eval prompt, doc section, example, and README
- `example_toml_config.py` / `example_toml_config_scheduler.toml` names consistent across Tasks 1, 2, 3
- Version `0.5.0` consistent across Tasks 5, 6, 7
- `severity_levels` table name consistent between TOML, .py, and README
