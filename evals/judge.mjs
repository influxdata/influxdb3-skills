// Grade one answer against a case's criteria with a pinned judge model and
// effort (ADR-0004). The Codex runner and evals/rescore.mjs both call this, so
// every judge gets the same prompt, schema, and isolation.
//
// A judge is { harness: 'claude' | 'codex', model, effort }. Claude judges run
// with --safe-mode and no tools; Codex judges ignore the user config and run in
// an empty directory. Neither can read the repository.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturePrompt, promptFor } from './cases.mjs';

// The schema fixes the number of checks, so a verdict that skips a criterion
// doesn't validate.
export function rubricSchema(criteriaCount) {
  return {
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      checks: {
        type: 'array',
        minItems: criteriaCount,
        maxItems: criteriaCount,
        items: {
          type: 'object',
          properties: { id: { type: 'integer', minimum: 1 }, pass: { type: 'boolean' }, evidence: { type: 'string' } },
          required: ['id', 'pass', 'evidence'],
          additionalProperties: false,
        },
      },
      summary: { type: 'string' },
    },
    required: ['pass', 'checks', 'summary'],
    additionalProperties: false,
  };
}

export function judgePrompt(testCase, byId, answer) {
  const criteria = testCase.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  return 'You are a strict evaluator. Grade the assistant response to the user prompt against every criterion below. ' +
    'Judge each criterion on its own, from the response text only.\n\n' +
    `${fixturePrompt(testCase)}User prompt:\n${promptFor(testCase, byId)}\n\nCriteria:\n${criteria}\n\n` +
    `Assistant response:\n<<<\n${answer}\n>>>\n\n` +
    'Return JSON only. Include exactly one check for each criterion, using consecutive ids starting at 1. ' +
    'Set pass to true only when every criterion passes. Evidence must quote the response without exposing any secret-like value.';
}

export function judgeCommand(judge, workDir, criteriaCount) {
  if (judge.harness === 'claude') {
    return ['claude', ['-p', '--safe-mode', '--tools', '', '--no-session-persistence', '--output-format', 'json',
      '--json-schema', JSON.stringify(rubricSchema(criteriaCount)), '--model', judge.model, '--effort', judge.effort,
      '--system-prompt', 'You grade answers against criteria. Reply only with JSON that matches the schema.']];
  }
  return ['codex', ['exec', '--ephemeral', '--ignore-user-config', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--cd', workDir, '--output-last-message', join(workDir, 'verdict.json'), '--output-schema', join(workDir, 'schema.json'),
    '--model', judge.model, '-c', `model_reasoning_effort="${judge.effort}"`]];
}

function run(command, args, input, cwd) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => done({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

// Returns { pass, checks, summary, costUsd?, usage?, models?, durationMs } or { error }.
export async function callJudge(judge, prompt, criteriaCount) {
  const workDir = mkdtempSync(join(tmpdir(), 'eval-judge-'));
  const started = Date.now();
  try {
    if (judge.harness === 'codex') writeFileSync(join(workDir, 'schema.json'), JSON.stringify(rubricSchema(criteriaCount)));
    const [command, args] = judgeCommand(judge, workDir, criteriaCount);
    const result = await run(command, args, prompt, workDir);
    let verdict;
    let extra = {};
    if (judge.harness === 'claude') {
      const output = JSON.parse(result.stdout || '{}');
      if (result.code !== 0 || output.is_error) return { error: `${output.result ?? result.stderr}`.slice(0, 2000) };
      verdict = output.structured_output ?? JSON.parse(output.result);
      extra = { costUsd: output.total_cost_usd, usage: output.usage, models: Object.keys(output.modelUsage ?? {}) };
    } else {
      if (result.code !== 0) return { error: result.stderr.slice(-2000) };
      verdict = JSON.parse(readFileSync(join(workDir, 'verdict.json'), 'utf8'));
      const usage = result.stdout.split('\n').filter((line) => line.includes('"turn.completed"')).map((line) => JSON.parse(line).usage).pop();
      extra = { usage };
    }
    const valid = Array.isArray(verdict.checks) && verdict.checks.length === criteriaCount &&
      verdict.checks.every((check, index) => check.id === index + 1 && typeof check.pass === 'boolean');
    if (!valid) return { error: `invalid verdict: ${JSON.stringify(verdict).slice(0, 500)}` };
    return { ...verdict, ...extra, durationMs: Date.now() - started };
  } catch (error) {
    return { error: error.message };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
