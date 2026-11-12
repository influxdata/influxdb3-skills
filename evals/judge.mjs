import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureFilesAsPromptText, userPromptWithEarlierTurns } from './cases.mjs';

export function verdictSchemaWithOneCheckPerCriterion(criteriaCount) {
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

export function judgePrompt(testCase, casesById, answerText) {
  const numberedCriteria = testCase.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  return 'You are a strict evaluator. Grade the assistant response to the user prompt against every criterion below. ' +
    'Judge each criterion on its own, from the response text only.\n\n' +
    `${fixtureFilesAsPromptText(testCase)}User prompt:\n${userPromptWithEarlierTurns(testCase, casesById)}\n\n` +
    `Criteria:\n${numberedCriteria}\n\nAssistant response:\n<<<\n${answerText}\n>>>\n\n` +
    'Return JSON only. Include exactly one check for each criterion, using consecutive ids starting at 1. ' +
    'Set pass to true only when every criterion passes. Evidence must quote the response without exposing any secret-like value.';
}

export function isolatedJudgeCommand(judgeSettings, emptyWorkDir, criteriaCount) {
  if (judgeSettings.harness === 'claude') {
    return ['claude', ['-p', '--safe-mode', '--tools', '', '--no-session-persistence', '--output-format', 'json',
      '--json-schema', JSON.stringify(verdictSchemaWithOneCheckPerCriterion(criteriaCount)),
      '--model', judgeSettings.model, '--effort', judgeSettings.effort,
      '--system-prompt', 'You grade answers against criteria. Reply only with JSON that matches the schema.']];
  }
  return ['codex', ['exec', '--ephemeral', '--ignore-user-config', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--cd', emptyWorkDir, '--output-last-message', join(emptyWorkDir, 'verdict.json'),
    '--output-schema', join(emptyWorkDir, 'schema.json'),
    '--model', judgeSettings.model, '-c', `model_reasoning_effort="${judgeSettings.effort}"`]];
}

function runWithStdin(command, args, stdinText, cwd) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => done({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (exitCode) => done({ exitCode, stdout, stderr }));
    child.stdin.end(stdinText);
  });
}

export async function requestVerdictOrError(judgeSettings, prompt, criteriaCount) {
  const emptyWorkDir = mkdtempSync(join(tmpdir(), 'eval-judge-'));
  const startedAtMs = Date.now();
  try {
    if (judgeSettings.harness === 'codex') {
      writeFileSync(join(emptyWorkDir, 'schema.json'), JSON.stringify(verdictSchemaWithOneCheckPerCriterion(criteriaCount)));
    }
    const [command, args] = isolatedJudgeCommand(judgeSettings, emptyWorkDir, criteriaCount);
    const processResult = await runWithStdin(command, args, prompt, emptyWorkDir);
    let verdict;
    let callDetails;
    if (judgeSettings.harness === 'claude') {
      const claudeOutput = JSON.parse(processResult.stdout || '{}');
      if (processResult.exitCode !== 0 || claudeOutput.is_error) {
        return { error: `${claudeOutput.result ?? processResult.stderr}`.slice(0, 2000) };
      }
      verdict = claudeOutput.structured_output ?? JSON.parse(claudeOutput.result);
      callDetails = { costUsd: claudeOutput.total_cost_usd, usage: claudeOutput.usage, models: Object.keys(claudeOutput.modelUsage ?? {}) };
    } else {
      if (processResult.exitCode !== 0) return { error: processResult.stderr.slice(-2000) };
      verdict = JSON.parse(readFileSync(join(emptyWorkDir, 'verdict.json'), 'utf8'));
      const usage = processResult.stdout.split('\n').filter((line) => line.includes('"turn.completed"'))
        .map((line) => JSON.parse(line).usage).pop();
      callDetails = { usage };
    }
    const hasOneCheckPerCriterion = Array.isArray(verdict.checks) && verdict.checks.length === criteriaCount &&
      verdict.checks.every((check, index) => check.id === index + 1 && typeof check.pass === 'boolean');
    if (!hasOneCheckPerCriterion) return { error: `invalid verdict: ${JSON.stringify(verdict).slice(0, 500)}` };
    return { ...verdict, ...callDetails, durationMs: Date.now() - startedAtMs };
  } catch (error) {
    return { error: error.message };
  } finally {
    rmSync(emptyWorkDir, { recursive: true, force: true });
  }
}
