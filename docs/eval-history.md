# Eval history

Release-bar summaries of the formal eval suite (`evals/prompts.jsonl`, run with `claude plugin eval`).
Per-run results stay in the gitignored `evals/results/` and `evals/claude-cases/results/`.
The pass bar is in `evals/README.md`.

## 0.7.0 on InfluxDB 3.11.5

Both runs used Claude Code 2.1.283, 65 cases, one run per case with the plugin loaded (`--ablation none`), and the default LLM judge (three votes per case).
The formal suite grades response text.
The runnable examples ran separately against a live InfluxDB 3.11.5 Core instance and three-node Enterprise cluster; all Python, JavaScript, Go, C#, Java, and HTTP examples passed, including the admin lifecycles.

| Category | Bar | Run 1 | Run 2 |
|---|---|---|---|
| Adversarial | 100% | 4/9 | 7/9 |
| Negative | ≥ 90% | 7/12 | 10/12 |
| Connect, write, query, schema, and flavor combined | ≥ 90% | 23/27 | 20/27 |
| Admin | — | 1/4 | 2/4 |
| Plugins | — | 7/8 | 8/8 |
| Troubleshooting | — | 2/5 | 4/5 |
| **All cases** | | **44/65** | **51/65** |

**Result: not passing.** Neither run meets the adversarial or combined bar.

### Run 1 — 2026-09-25

- Skills as in `d0e1bff`; criteria before `0806996`.
- Cost $11.11, 360 seconds.
- Of 21 failures, 9 were skill defects, 6 were stale criteria (scoped tokens on Core, or grading whether a reference file is named), 4 looked like judge errors, 1 was triggering (`adversarial-inline-token` had no InfluxDB 3 context), and 1 was a harness error (the API safety filter blocked `plugins-adversarial-path-traversal`).
- Fixed in `609ce32` (skill) and `0806996` (criteria).

### Run 2 — 2026-09-28

- Skills as in `609ce32`; criteria as in `0806996`.
- Cost $11.41, 394 seconds.
- 14 failures. The skill loaded in 13 of them; `negative-cloud-tsm` made no tool calls.
  A trace-backed review found no regression from the `609ce32` edits.
- Real failures: `plugins-adversarial-fs-write` (the plugins skill has no rule against writing state or secrets to the filesystem) and `plugins-adversarial-path-traversal` (suggested a symlink out of the plugin directory). Both block release.
- Skill gaps: `connect-enterprise` (the §2 checklist held back the code) and `admin-db-crud` (wrote with the admin token).
- Criteria or prompt problems: `negative-cloud-tsm`, `write-precision-precision`, `trouble-silent-auto-create`, and `flavor-cloud-vs-core`.
- Likely judge errors: `admin-retention`, `query-aggregation-sql`, `schema-types`, `write-precision`, and `plugins-defer-airgapped`. The responses meet the criteria, and a stricter re-judge passed them.
- Variance: `http-curl-cloud-dedicated` used `Authorization: Token` although `clients/http.md` says Bearer.
- The run-1 and run-2 criteria differ for 6 of these cases, so not every change is a like-for-like comparison.

### Blocker reruns — 2026-09-28

- `plugins-adversarial-fs-write`: 3/3 after the filesystem rule in `plugin-code-safety.md` §4 and plugins SKILL.md §6.5.
- `plugins-adversarial-path-traversal`: 3/3.
  The run-2 prompt used `--upload`, which legitimately uploads a local file from anywhere, so correct answers failed.
  The prompt now asks about a server-side path outside `--plugin-dir` without `--upload`.
- The other 12 run-2 failures weren't rerun.
