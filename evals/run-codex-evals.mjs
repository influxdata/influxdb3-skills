#!/usr/bin/env node
// Run the harness-neutral prompts with Codex and grade every criterion using a
// second, structured Codex pass. Output is intentionally kept in evals/results/.
//
// Examples:
//   node evals/run-codex-evals.mjs --case admin-db-crud --runs 1
//   node evals/run-codex-evals.mjs --runs 3 --model gpt-5.3-codex
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evalsDir = join(repoDir, 'evals');
const rubricSchema = join(evalsDir, 'codex-rubric.schema.json');

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node evals/run-codex-evals.mjs [--case id[,id...]] [--runs N] [--model MODEL] [--judge-model MODEL]');
  process.exit(message ? 2 : 0);
}

function args(argv) {
  const options = { caseIds: null, runs: 1, model: null, judgeModel: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--case') options.caseIds = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (value === '--runs') options.runs = Number(argv[++i]);
    else if (value === '--model') options.model = argv[++i];
    else if (value === '--judge-model') options.judgeModel = argv[++i];
    else if (value === '--help' || value === '-h') usage();
    else usage(`unknown argument '${value}'`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) usage('--runs must be a positive integer');
  return options;
}

function readCases() {
  return readFileSync(join(evalsDir, 'prompts.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`prompts.jsonl line ${index + 1}: ${error.message}`);
      }
    });
}

function promptFor(testCase, byId) {
  if (!testCase.follows) return testCase.prompt;
  const parent = byId.get(testCase.follows);
  if (!parent) throw new Error(`${testCase.id}: follows unknown case '${testCase.follows}'`);
  return `Earlier in this conversation I asked: "${promptFor(parent, byId)}"\n\n${testCase.prompt}`;
}

function skillPrompt(testCase) {
  if (testCase.id.startsWith('plugins-')) {
    return `You are answering a user with the InfluxDB 3 Processing Engine plugins skill from this checked-out repository. ` +
      `Before answering, read skills/influxdb3-plugins/SKILL.md and any references it routes you to. `;
  }
  return `You are answering a user with the InfluxDB 3 skill from this checked-out repository. ` +
    `Before answering, read skills/influxdb3/SKILL.md and any references it routes you to. `;
}

function runCodex({ prompt, tracePath, outputPath, model, schemaPath }) {
  const command = ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--cd', repoDir,
    '--output-last-message', outputPath];
  if (schemaPath) command.push('--output-schema', schemaPath);
  if (model) command.push('--model', model);
  command.push(prompt);

  const result = spawnSync('codex', command, { cwd: repoDir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  writeFileSync(tracePath, result.stdout ?? '', 'utf8');
  if (result.stderr) writeFileSync(`${tracePath}.stderr`, result.stderr, 'utf8');
  return { exitCode: result.status ?? 1, error: result.error?.message };
}

function evaluatorPrompt(testCase, response) {
  const numberedCriteria = testCase.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  return `You are a strict evaluator. Grade the assistant response to the user prompt against every criterion below.\n\n` +
    `User prompt:\n${testCase.prompt}\n\nCriteria:\n${numberedCriteria}\n\nAssistant response:\n${response}\n\n` +
    `Return JSON only. Include exactly one check for each criterion, using consecutive ids starting at 1. ` +
    `Set pass to true only when every criterion passes. Evidence must cite the response without exposing any secret-like value.`;
}

function grade(testCase, response, resultDir, runNumber, judgeModel) {
  const responsePath = join(resultDir, `${testCase.id}.run-${runNumber}.response.txt`);
  const judgePath = join(resultDir, `${testCase.id}.run-${runNumber}.judge.json`);
  writeFileSync(responsePath, response, 'utf8');
  const execution = runCodex({
    prompt: evaluatorPrompt(testCase, response),
    tracePath: join(resultDir, `${testCase.id}.run-${runNumber}.judge.trace.jsonl`),
    outputPath: judgePath,
    model: judgeModel,
    schemaPath: rubricSchema,
  });
  if (execution.exitCode !== 0 || !existsSync(judgePath)) {
    return { pass: false, reason: `judge failed (exit ${execution.exitCode})`, execution };
  }
  try {
    const judgement = JSON.parse(readFileSync(judgePath, 'utf8'));
    const validChecks = Array.isArray(judgement.checks) && judgement.checks.length === testCase.criteria.length &&
      judgement.checks.every((check, index) => check.id === index + 1 && typeof check.pass === 'boolean');
    return { pass: validChecks && judgement.pass === true && judgement.checks.every((check) => check.pass), judgement };
  } catch (error) {
    return { pass: false, reason: `invalid judge JSON: ${error.message}` };
  }
}

const options = args(process.argv.slice(2));
const allCases = readCases();
const byId = new Map(allCases.map((testCase) => [testCase.id, testCase]));
const cases = options.caseIds
  ? options.caseIds.map((id) => byId.get(id) ?? usage(`unknown case '${id}'`))
  : allCases;
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultDir = join(evalsDir, 'results', `codex-${timestamp}`);
mkdirSync(resultDir, { recursive: true });
const results = [];

for (const testCase of cases) {
  for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
    const execution = runCodex({
      prompt: skillPrompt(testCase) +
        `Do not edit files or run external commands. Answer the following request directly:\n\n${promptFor(testCase, byId)}`,
      tracePath: join(resultDir, `${testCase.id}.run-${runNumber}.trace.jsonl`),
      outputPath: join(resultDir, `${testCase.id}.run-${runNumber}.answer.txt`),
      model: options.model,
    });
    const answerPath = join(resultDir, `${testCase.id}.run-${runNumber}.answer.txt`);
    if (execution.exitCode !== 0 || !existsSync(answerPath)) {
      results.push({ id: testCase.id, run: runNumber, pass: false, reason: `agent failed (exit ${execution.exitCode})`, execution });
      continue;
    }
    results.push({ id: testCase.id, run: runNumber, ...grade(testCase, readFileSync(answerPath, 'utf8'), resultDir, runNumber, options.judgeModel) });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  model: options.model ?? 'Codex default',
  judgeModel: options.judgeModel ?? 'Codex default',
  runs: options.runs,
  results,
};
writeFileSync(join(resultDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
const passed = results.filter((result) => result.pass).length;
console.log(`${passed}/${results.length} Codex eval runs passed. Results: ${resultDir}`);
process.exit(passed === results.length ? 0 : 1);
