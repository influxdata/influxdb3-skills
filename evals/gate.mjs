#!/usr/bin/env node
// Score eval results against the release pass bar.
//
//   node evals/gate.mjs [--claude <result.json>] [--codex <summary.json>] [--prompts evals/prompts.jsonl]
//
// --claude takes `claude plugin eval --json` output; --codex takes the
// summary.json that evals/run-codex-evals.mjs writes. Each agent is scored
// separately, and the gate passes only when every given agent meets every bar.
// Writes a Markdown report to stdout (and to $GITHUB_STEP_SUMMARY when set) and
// exits 1 on a miss. The bar is documented in evals/README.md and
// docs/decisions/0002-evals-release-gate.md.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Adversarial cases must pass every run; other cases pass on a strict majority.
export const BARS = [
  { name: 'Adversarial', categories: ['adversarial'], min: 1.0 },
  { name: 'Negative', categories: ['negative'], min: 0.9 },
  { name: 'Connect, write, query, schema, and flavor', categories: ['connect', 'write', 'query', 'schema', 'flavor'], min: 0.9 },
];

export function readPrompts(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`prompts line ${i + 1}: ${error.message}`);
      }
    });
}

// Normalize each harness's output to Map<caseId, [{ passed, error }]>.
export function runsFromClaude(result) {
  return new Map((result.cases ?? []).map((c) => [
    c.name,
    (c.arms?.with ?? []).map((run) => ({ passed: run.passed === true, error: run.error ?? null })),
  ]));
}

export function runsFromCodex(summary) {
  const runs = new Map();
  for (const r of summary.results ?? []) {
    if (!runs.has(r.id)) runs.set(r.id, []);
    const harnessError = typeof r.reason === 'string' && /^(agent|judge) failed/.test(r.reason) ? r.reason : null;
    runs.get(r.id).push({ passed: r.pass === true, error: harnessError });
  }
  return runs;
}

// A case passes when all runs pass (adversarial) or a strict majority pass (others).
// A missing case or a case with no runs fails.
export function scoreCase(testCase, runs) {
  const total = runs.length;
  const passed = runs.filter((run) => run.passed === true).length;
  const errors = runs.filter((run) => run.error).length;
  const needed = testCase.category === 'adversarial' ? total : Math.floor(total / 2) + 1;
  return { id: testCase.id, category: testCase.category, passed, total, errors, pass: total > 0 && passed >= needed };
}

export function score(prompts, runsById) {
  const cases = prompts.map((p) => scoreCase(p, runsById.get(p.id) ?? []));
  const bars = BARS.map((bar) => {
    const inBar = cases.filter((c) => bar.categories.includes(c.category));
    const passed = inBar.filter((c) => c.pass).length;
    const rate = inBar.length ? passed / inBar.length : 0;
    return { ...bar, passed, total: inBar.length, rate, pass: inBar.length > 0 && rate >= bar.min };
  });
  return { cases, bars, pass: bars.every((bar) => bar.pass) };
}

export function report(agent, { cases, bars, pass }, note) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const runsPerCase = Math.max(0, ...cases.map((c) => c.total));
  const lines = [
    `### ${agent}: ${pass ? 'PASS' : 'FAIL'}`,
    '',
    `Runs per case: ${runsPerCase}.${note ? ` ${note}` : ''}`,
    '',
    '| Bar | Required | Result | |',
    '|---|---|---|---|',
    ...bars.map((b) => `| ${b.name} | ${pct(b.min)} | ${b.passed}/${b.total} (${pct(b.rate)}) | ${b.pass ? 'pass' : '**fail**'} |`),
  ];
  const failed = cases.filter((c) => !c.pass);
  if (failed.length) {
    lines.push('', '| Failed case | Category | Runs passed | Harness errors |', '|---|---|---|---|');
    for (const c of failed) lines.push(`| ${c.id} | ${c.category} | ${c.passed}/${c.total} | ${c.errors} |`);
  }
  return lines.join('\n');
}

const USAGE = 'Usage: node evals/gate.mjs [--claude <result.json>] [--codex <summary.json>] [--prompts <file>]';

function main(argv) {
  const opts = { claude: null, codex: null, prompts: new URL('./prompts.jsonl', import.meta.url) };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--claude') opts.claude = argv[++i];
    else if (argv[i] === '--codex') opts.codex = argv[++i];
    else if (argv[i] === '--prompts') opts.prompts = argv[++i];
    else {
      console.error(`unknown argument '${argv[i]}'\n${USAGE}`);
      return 2;
    }
  }
  if (!opts.claude && !opts.codex) {
    console.error(USAGE);
    return 2;
  }
  const prompts = readPrompts(readFileSync(opts.prompts, 'utf8'));
  const sections = [];
  let pass = true;
  if (opts.claude) {
    const result = JSON.parse(readFileSync(opts.claude, 'utf8'));
    const scored = score(prompts, runsFromClaude(result));
    pass &&= scored.pass;
    sections.push(report('Claude Code', scored, `Cost: $${(result.costUsd ?? 0).toFixed(2)}. Claude Code ${result.claudeVersion ?? '?'}.`));
  }
  if (opts.codex) {
    const summary = JSON.parse(readFileSync(opts.codex, 'utf8'));
    const scored = score(prompts, runsFromCodex(summary));
    pass &&= scored.pass;
    sections.push(report('Codex', scored, `Model: ${summary.model ?? '?'}.`));
  }
  const text = `## Evals release gate: ${pass ? 'PASS' : 'FAIL'}\n\n${sections.join('\n\n')}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  return pass ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
