#!/usr/bin/env node
// Reduce a full eval result file to the runs that release verification scores.
//
//   node evals/slim-evidence.mjs <claude|codex> <full-result.json> <out.runs.json>
//
// The full result file (answers, traces, and judge reasons) goes to the internal
// eval archive. The runs file is committed to evals/evidence/v<version>/ and
// records the full file's sha256, so a maintainer can match the two.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runsFromClaude, runsFromCodex } from './gate.mjs';

export const RUNS_FORMAT = 'runs-v1';
const CODEX_SETTINGS = ['model', 'judgeModel', 'effort', 'judgeEffort', 'verbosity'];

// Validates run identities against the full file, then keeps one {passed, error, loaded?} entry per run.
// Evidence from before the identity rules (0.7.0) is slimmed with validateRuns: false.
export function slimRuns(agent, text, { validateRuns = true } = {}) {
  const result = JSON.parse(text);
  let runs;
  if (agent === 'claude') runs = runsFromClaude(result, { validateRuns });
  else if (agent === 'codex') runs = runsFromCodex(result, { validateRuns });
  else throw new Error(`unknown agent: ${agent}`);
  return {
    format: RUNS_FORMAT,
    agent,
    source_sha256: createHash('sha256').update(text).digest('hex'),
    // Older Codex summaries have no effort fields; copy only the settings a summary records,
    // so released evidence still recomputes exactly.
    ...(agent === 'codex' ? Object.fromEntries(CODEX_SETTINGS.filter((key) => key in result).map((key) => [key, result[key]])) : {}),
    cases: Object.fromEntries(runs),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [agent, input, output] = process.argv.slice(2);
  if (!agent || !input || !output) {
    console.error('Usage: node evals/slim-evidence.mjs <claude|codex> <full-result.json> <out.runs.json>');
    process.exit(1);
  }
  try {
    const slim = slimRuns(agent, readFileSync(input, 'utf8'));
    writeFileSync(output, `${JSON.stringify(slim, null, 2)}\n`);
    console.log(`${output}: ${Object.keys(slim.cases).length} cases, source sha256 ${slim.source_sha256}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
