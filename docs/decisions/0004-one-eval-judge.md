# ADR-0004: Judge both agents' eval answers with Opus 5.5 at medium effort

## Status
Accepted

## Date
2026-11-12

## Context
Until 0.7.4, each agent's answers were judged by a model from its own family, at whatever effort the harness inherited:

| Run | Answers | Judge |
|---|---|---|
| Claude Code | Opus 5.5, effort not set | Opus 5.5, effort not set |
| Codex | `gpt-6.1-sol`, effort `low` from a personal config | `gpt-6.1-sol`, effort `low` |

Claude and Codex scores couldn't be compared, because the judge differed along with the answering agent.
No one had measured whether either judge applied the criteria as the maintainers meant them.
On the 0.7.3 rerun, the Opus adversarial bar failed on verdicts that read as criterion wording, not unsafe answers.

#49 measured this in three steps before choosing:

1. Criteria that a pattern can decide moved to `regex` checks (#51).
2. Criteria that judges read differently were rewritten to state one condition each (#52).
3. Six candidate judges re-scored stored answers with `evals/rescore.mjs` (#53). A maintainer labeled only the criteria where the judges split.

Step 3 re-scored 95 stored answers on the eight disputed cases. The answers came from Opus and `gpt-6.1-sol` suites on 796c769 and 79dee1f. Each judge cast three votes per answer with its effort pinned.

| Judge | Matches labels | Errors | Cost (USD) |
|---|---|---|---|
| `claude-opus-5-5` medium | 9/9 | 3/285 | 6.40 |
| `claude-opus-5-5` high | 9/9 | 2/285 | 5.70 |
| `claude-fable-5-2` medium | 8/9 | 0/285 | 11.90 |
| `gpt-6-astra` low | 0/9 | 0/285 | tokens only |
| `gpt-6-astra` medium | 2/9 | 0/285 | tokens only |
| `gpt-6.1-sol` medium | 2/9 | 0/285 | tokens only |

What the run showed:

- **The judges agreed on almost everything.** Only 9 of 236 criteria split, and every judge's own three votes agreed on 97% to 100% of criteria.
- **Most splits came from the criteria, not the judges.** In 7 of the 9, the judges that failed the answer graded a condition the criterion wasn't meant to test: whether generated code works, or how its fallback branches are written. #52 narrowed those criteria. The other 2 exposed a gap in the plugins skill, which #52 also fixed.
- **The splits follow the model families.** In 5 of the 9, the three Claude judges passed the answer and the three Codex judges failed it. The maintainer labeled all 9 pass.
- **Opus sometimes returns too few checks.** 5 of its 570 calls returned one check for a case with two or three criteria. The other judges returned no invalid verdicts.
- **Claude judges pass more of the Opus answers.** Claude judges passed 112 or 113 of 116 criteria on Opus answers, and Codex judges 107 or 108. On `gpt-6.1-sol` answers the gap was smaller: 109 against 106 to 108 of 120. On the labeled splits, the passing verdicts were the right ones.

After #52 narrowed three of those cases, the same six judges re-scored the cases' 36 stored answers under the new wording:

- None of the 72 criteria split.
- Every judge's three votes agreed on every criterion, and no call returned an invalid verdict.
- Every judge passed 35 of 36 criteria on the Opus answers and 26 of 36 on the `gpt-6.1-sol` answers, so the family gap above disappeared on these cases.
- Claude cost: Opus `high` $1.87, Opus `medium` $2.55, Fable `medium` $4.59.

Once each criterion stated one condition, the choice of judge stopped changing any verdict.

## Decision
`claude-opus-5-5` at effort `medium` judges every release suite, for both agents. See the 2026-11-12 amendment: the decision was `high` when accepted.

- **Claude Code runs:** `CLAUDE_CODE_EFFORT_LEVEL=medium claude plugin eval --judge-model claude-opus-5-5`. The variable sets the answering agent's effort and the judge's together (#50).
- **Codex runs:** the Codex runner judges each answer with the same Claude call that `evals/rescore.mjs` makes, from `evals/judge.mjs`: `--safe-mode`, no tools, no session persistence, the rubric schema, and the model and effort pinned.
- **Manifest:** each evidence entry records the judge model and effort. All entries in a release, for both agents, use the same judge model and judge effort, and `evals/check-release.mjs verify` enforces it.
- **Audit judge:** before an adversarial failure blocks a release, or before a criterion changes because of a verdict, re-score the disputed answers with `gpt-6.1-sol` at `medium` through `evals/rescore.mjs`. When the two judges split, a maintainer labels the split, as ADR-0002 requires for judge disagreements.

When judges disagree on a criterion, narrow the criterion first. A criterion states one condition a reader can check in the answer, and doesn't ask the judge whether code works. A judge can't run code, and the skill can only point the agent to working examples, which the live example checks run.

## Alternatives considered

### Keep a judge from each agent's own family
- Pros: no cross-harness wiring. Each runner keeps its built-in judge.
- Cons: Claude and Codex scores stay incomparable, which was the problem #49 set out to fix.
- Rejected.

### `gpt-6.1-sol` or `gpt-6-astra` for both agents
- Pros: no invalid verdicts in 285 calls each.
- Cons: matched 0 to 2 of the 9 labels. The Codex judges failed answers on conditions outside the criterion, such as an assumed API response shape that was wrong for 3.12.1.
- Rejected as the release judge. Kept as the audit judge, because it reads more literally: its failures on `plugins-secret-trigger-arg` pointed at a real gap in the skill.

### `claude-fable-5-2` at `medium`
- Pros: no invalid verdicts. Matched 8 of 9 labels.
- Cons: about twice the cost of Opus. #49 accepts moving above Opus only if the larger model agrees with the labels where Opus at higher effort doesn't, and both Opus efforts matched all 9.
- Rejected.

### Opus 5.5 at `high`
- Pros: matched the same 9 labels as `medium`. Cost less on both runs: $5.70 against $6.40, and $1.87 against $2.55. Returned 2 invalid verdicts against 3. The cause of the cost difference isn't known.
- Cons: `claude plugin eval` has no judge effort option. `CLAUDE_CODE_EFFORT_LEVEL=high` would also run the answering agent at `high`, which changes what the suite measures, or the Claude Code runs would need a separate judging step.
- Accepted first, then replaced by `medium`. See the amendment.

### Label every answer by hand
- Pros: a full answer key.
- Cons: about 2 hours per judge decision, and a pilot of 7 labels had 2 labeling slips.
- Rejected. Labels go only where judges split.

## Consequences
- Codex suite runs need Claude Code authentication and add about $6 of Opus judging per full suite.
- The Codex runner gains a Claude judge path. Until it lands, Codex evidence keeps its `gpt-6.1-sol` judge and stays advisory, as ADR-0002 states.
- Opus judges answers from its own family. On the overbroad criteria, Claude judges passed more of the Opus answers than the Codex judges did. The gap disappeared once the criteria were narrowed, but the audit judge stays in the release process for adversarial failures, so a family bias on a future criterion still gets a second reading.
- Pin the number of checks in each judge call's schema to the case's criteria count, so an Opus verdict with too few checks is rejected by the schema instead of becoming an error.
- Re-score the 0.7.3 evidence and the 796c769 answers with the chosen judge, so `docs/eval-history.md` and #46 stay comparable. Record old and new scores for the same answers, so a change caused by grading isn't read as a skill regression.
- A permanent set of reference labels stays deferred. Add it if the same disputed cases come back across releases.

## Amendments

### 2026-11-12: Judge at `medium`, not `high`

The ADR was accepted with Opus at `high`. Wiring it showed that `claude plugin eval` 2.1.322 has no judge effort option: `CLAUDE_CODE_EFFORT_LEVEL` sets the answering agent's effort and the judge's together.
Judging at `high` would have meant answering at `high` too, or adding a separate judging step for the Claude Code runs.
`medium` and `high` gave the same verdict on every criterion in both re-scores, so the judge runs at `medium` and the Claude Code answers stay at `medium`.
`medium` cost more on both re-scores and returned one more invalid verdict. The judge schema now fixes the number of checks, so a verdict that skips a criterion no longer validates.
