# InfluxDB 3 Plugins Skill — TOML Config Coverage — Design Spec (v0.5.0)

- **Status:** Approved (brainstorm complete, awaiting user spec review)
- **Author:** Gary Fowler
- **Date:** 2026-05-15
- **Target version:** 0.5.0 (minor bump from 0.4.2)
- **Builds on:** `2026-05-07-influxdb3-plugins-skill-design.md` (v0.2.0 baseline) and the v0.4.x troubleshooting work
- **Scope envelope:** "Approach 2" from brainstorm — single new doc section + new example folder + one cross-link, additive only

## 1. Purpose & Scope

### Purpose

Close the long-standing deferral "TOML config files for plugins → v0.3.0+ covers TOML config patterns" in `skills/influxdb3-plugins/SKILL.md` (line 151). The InfluxDB 3 Processing Engine has built-in TOML config loading — set `config_file_path=<filename>` in `--trigger-arguments` and the engine reads the file from `PLUGIN_DIR` and merges its keys into the `args` dict the plugin entry-point receives, preserving native types. The skill should teach this so future plugin authors stop hitting the deferral.

### Scope (v0.5.0)

- **One new doc section** in `references/plugin-structure.md` — "Plugin configuration via TOML."
- **One new example** under `examples/toml_config/` — minimal scheduled-trigger "threshold notifier" plugin demonstrating the mechanism.
- **One cross-link** added to `references/triggers-cli.md` in the `--trigger-arguments` discussion.
- **Deferral removal** — delete the TOML deferral line from `SKILL.md` §11.
- **Version bump** — `0.4.2` → `0.5.0` across SKILL.md frontmatter, plugin.json, and the SKILL.md §11 header.
- **CHANGELOG.md** entry under new `## 0.5.0 — 2026-05-15` heading.
- **One new eval prompt** locking in that the new coverage is reachable from a realistic developer prompt.

### Explicitly deferred (still)

The three other v0.4.0 deferrals are unchanged in this release:
- Distributed cluster placement → v0.2.1 (still not shipped)
- Air-gapped / `--package-manager disabled` → v0.3.0+
- Full Explorer-compatible plugin metadata schemas → v0.3.0+

### Non-goals

- Not retrofitting existing examples (`scheduled/`, `wal/`, `request/`, `cache_counter/`, `multifile_alert/`) to use TOML — they continue to demonstrate inline `--trigger-arguments`. The new `toml_config/` example stands alone.
- Not creating a new top-level `references/configuration.md` reference doc. The TOML content lives inside `plugin-structure.md` to keep the reference taxonomy stable.
- Not documenting TOML/inline-args precedence — the canonical InfluxData README is silent on it, so the skill is too. (If a developer asks, the skill should defer to the canonical example repo.)
- Not running the example against a live InfluxDB 3 instance as part of the eval gate. Runtime verification happens downstream when developers copy the pattern.

## 2. Canonical Mechanism (verified)

Cross-referenced against `influxdata/influxdb3_plugins/influxdata/basic_transformation/` on `main` (2026-05-15):

- **Activation:** `--trigger-arguments config_file_path=<filename.toml>` on `influxdb3 create trigger`.
- **File location:** Under the directory `PLUGIN_DIR` resolves to on the InfluxDB 3 host, alongside the `.py` file. `config_file_path` is interpreted relative to `PLUGIN_DIR`.
- **House naming convention** (recommended, not enforced): `<plugin_base>_config_<trigger_type>.toml` — e.g., `basic_transformation_config_scheduler.toml`, `basic_transformation_config_data_writes.toml`. Different file per trigger type because different entry points typically want different schemas.
- **Delivery to plugin:** Engine parses the TOML and merges its keys into the `args` dict. The plugin does **not** import `tomllib`. TOML primitives come through as native Python types (`int`, `float`, `bool`, `list`, `dict`) — distinct from inline `--trigger-arguments key=val`, which are always strings.
- **Precedence with inline args:** undocumented upstream. Skill stays silent.

Verbatim source: the header comment in `basic_transformation_config_scheduler.toml`:

> "Copy this file to your PLUGIN_DIR and reference it with `--trigger-arguments config_file_path=basic_transformation_config_scheduler.toml`"

## 3. File Plan

### Created (3 files)

```
skills/influxdb3-plugins/examples/toml_config/
├── example_toml_config.py                       # ~30 lines, scheduled-trigger plugin
├── example_toml_config_scheduler.toml           # ~15 lines, demonstrates scalars + nested table
└── README.md                                     # ~40 lines, walkthrough
```

### Modified (5 files, additive only)

| File | Change |
|---|---|
| `skills/influxdb3-plugins/references/plugin-structure.md` | Append new section "Plugin configuration via TOML" (see §4 for outline) |
| `skills/influxdb3-plugins/references/triggers-cli.md` | Add 2–3 line note + cross-link in the `--trigger-arguments` discussion |
| `skills/influxdb3-plugins/SKILL.md` | Remove deferral line 151; bump §11 header from `(v0.4.0)` to `(v0.5.0)`; bump frontmatter `version: 0.4.2` → `0.5.0`; update `last_verified:` to `2026-05-15` |
| `CHANGELOG.md` | Prepend `## 0.5.0 — 2026-05-15` entry |
| `plugin.json` | Bump `"version": "0.4.2"` → `"0.5.0"` |

### Not touched

All five existing example folders; all other reference files (`runtime-api.md`, `state-and-cache.md`, `testing.md`, `troubleshooting.md`, `dependencies.md`, `doc-urls.md`, `installing.md`, `trigger-types.md`); the eval suite directory structure (only ONE new prompt added); the `docs/superpowers/plans/` and `docs/superpowers/specs/` archives.

## 4. Doc Section Outline — `plugin-structure.md` new section

Appended after the existing "Multi-file plugin" / "When to use which" sections. Order:

1. **One-paragraph intro.** "InfluxDB 3 loads TOML config files for you. Set `config_file_path=<filename>` in `--trigger-arguments`; the engine reads the TOML and merges its keys into the `args` dict your entry-point receives. No `tomllib` call in the plugin."
2. **File location.** Under `PLUGIN_DIR` on the InfluxDB 3 host, alongside the `.py` file. `config_file_path` resolved relative to `PLUGIN_DIR`.
3. **Naming convention.** Recommended (not required) house style `<plugin_base>_config_<trigger_type>.toml`, with the reasoning (different schemas per entry point, easier recognition for downstream developers).
4. **Worked example.** Minimal TOML + minimal `process_scheduled_call` showing a TOML key (`threshold = 75`) arriving as `args["threshold"]` with type `int`.
5. **Trigger command.** Full `influxdb3 create trigger` block including `--trigger-arguments config_file_path=...`.
6. **What the engine does to values.** Native-type preservation — the practical reason to prefer TOML over inline `key=val` for non-trivial config.
7. **Cross-link to the example.** One-line pointer to `examples/toml_config/`.
8. **Fetch-fresh-docs reminder.** One-line link to the canonical InfluxData URL already in `doc-urls.md`.

Target density: ~120–180 lines of new markdown, matching the existing sections in that file.

## 5. Example Plugin Design

**Scenario:** Threshold notifier — every scheduled tick, log a message at one of two severity levels depending on a numeric threshold read from TOML. No real querying, no real writing. Exists purely to demonstrate that TOML values reach `args` with their native Python types.

**`example_toml_config.py` — ~30 lines:**

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

**`example_toml_config_scheduler.toml` — ~15 lines:**

```toml
# Threshold for alerting (int, not a string — the engine preserves TOML types)
threshold = 75

# Optional label included in log output
label = "demo-trigger"

# Nested table — comes through as a Python dict in args["severity_levels"]
[severity_levels]
warn = 70
alert = 90
```

**`README.md` — ~40 lines:**

1. One-paragraph "what this plugin does"
2. Install/trigger commands (verbatim copy-pasteable block)
3. What to look for in `system.processing_engine_logs` to verify (the log line shape and `(int)` type evidence)
4. "Things to notice" bullet list — TOML types preserved, nested tables become dicts, `config_file_path` is `PLUGIN_DIR`-relative, the convention name pattern

**Why this scenario:**
- Zero external dependencies (empty `requirements.txt`)
- Exercises three TOML features: scalars, native typing, nested tables
- Only side-effect is `influxdb3_local.info()` — observable via `system.processing_engine_logs` (already documented in the skill)
- Mirrors the `examples/scheduled/` "hello world for X" pacing — consistent feel

## 6. Versioning & CHANGELOG

**Version bump: 0.4.2 → 0.5.0** (minor, not patch). Net-new capability the skill previously refused.

**Files updated:**
- `skills/influxdb3-plugins/SKILL.md` frontmatter `version:`
- `skills/influxdb3-plugins/SKILL.md` `last_verified:` → `2026-05-15`
- `skills/influxdb3-plugins/SKILL.md` §11 section header `(v0.4.0)` → `(v0.5.0)`
- `plugin.json` `"version"`
- `verified_against:` unchanged at `3.8` unless validated against a newer build (open question for spec review)

**Deferral line removed (only this one):**

```
- **TOML config files for plugins** → "v0.3.0+ covers TOML config patterns."
```

Other three deferrals (cluster placement, air-gapped, Explorer metadata schemas) untouched.

**CHANGELOG.md new entry, prepended:**

```markdown
## 0.5.0 — 2026-05-15

### Added
- **Plugin configuration via TOML** — `references/plugin-structure.md` now documents the built-in `config_file_path` mechanism: the engine loads a TOML file from `PLUGIN_DIR` and merges its keys into the `args` dict passed to the plugin entry-point, preserving native types.
- New `examples/toml_config/` example: a scheduled-trigger "threshold notifier" plugin with a matching TOML file, demonstrating scalar values, nested tables, and the InfluxData `<plugin>_config_<trigger_type>.toml` naming convention.
- Short cross-link from `references/triggers-cli.md` (in the `--trigger-arguments` section) pointing at the new TOML coverage.

### Removed
- Deferral note "TOML config files for plugins → v0.3.0+ covers TOML config patterns" from `SKILL.md` — replaced by actual coverage.
```

## 7. Verification

1. **Existing smoke gate must still pass.** Current eval suite reports 29/29 PASS on v0.4.2 (per commit `d9c6c35`). Required gate before commit; no regressions tolerated.
2. **One new eval prompt added.** Single additive prompt (e.g., "I want my plugin to read its threshold from a TOML file instead of hard-coding it. How do I wire that up?"). Expected-answer characteristics: mentions `config_file_path` in `--trigger-arguments`, places the TOML in `PLUGIN_DIR`, notes the engine does parsing (no `tomllib` call in plugin), notes native-type preservation.
3. **Manual eyeball.** Read new doc section + example README cold. Validate TOML parses with `python3 -c "import tomllib; tomllib.load(open(..., 'rb'))"`. Syntax-check the Python via `python3 -m py_compile`.
4. **Pre-commit checks.** `git diff --stat` matches §3 footprint. SKILL.md only loses line 151. CHANGELOG entry at top. Version strings consistent across all files.
5. **Not in scope:** running the example against a live InfluxDB 3 cluster. The skill's job is teaching Claude to produce correct plugin code; runtime verification happens downstream.

## 8. Open Questions

- **`verified_against:` versions in SKILL.md frontmatter.** Currently `influxdb3_core: 3.8`, `influxdb3_enterprise: 3.8`, `influxdb3_pe_runtime: 3.8`. Should these advance with the v0.5.0 ship, or hold at 3.8 until separately re-verified against a newer build? Default: hold.
- **Naming convention strength.** Spec teaches `<plugin_base>_config_<trigger_type>.toml` as "recommended." Should the skill go further and say "follow this convention" without the "not required" hedge? Default: keep the hedge — the engine doesn't enforce it.

## 9. Risk & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Smoke gate regression from doc-format changes | Low | Run full suite before commit |
| New eval prompt is too narrow / passes trivially | Medium | Author the expected-answer rubric strictly; require multiple keyword hits |
| InfluxDB 3 engine changes the TOML mechanism after this ships | Low | Skill points at canonical InfluxData example repo as fallback |
| Naming-convention guidance becomes wrong if InfluxData house style shifts | Low | Phrased as "recommended," not "required" — easy to soften later |
| User retrofits existing examples in a follow-up commit | Out of scope | Explicit non-goal in §1 |
