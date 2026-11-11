#!/usr/bin/env node
// Run the harness-neutral prompts with Codex and grade every criterion using a
// second, structured Codex pass. Output is intentionally kept in evals/results/.
//
// Examples:
//   node evals/run-codex-evals.mjs --case admin-db-create --runs 1 --effort medium --judge-effort medium
//   node evals/run-codex-evals.mjs --runs 3 --model gpt-6.1-sol --judge-model gpt-6.1-sol --effort medium --judge-effort medium
//
// Every run ignores ~/.codex/config.toml, so a maintainer's personal model, effort,
// verbosity, and installed plugins can't change the scores. Effort is required;
// verbosity is optional and uses the model default when unset.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evalsDir = join(repoDir, 'evals');
const rubricSchema = join(evalsDir, 'codex-rubric.schema.json');

const USAGE = 'Usage: node evals/run-codex-evals.mjs --effort LEVEL --judge-effort LEVEL [--verbosity LEVEL] ' +
  '[--case id[,id...]] [--runs N] [--model MODEL] [--judge-model MODEL]';
const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const VERBOSITIES = ['low', 'medium', 'high'];

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(USAGE);
  process.exit(message ? 2 : 0);
}

export function parseArgs(argv) {
  const options = { caseIds: null, runs: 1, model: 'gpt-6.1-sol', judgeModel: 'gpt-6.1-sol', effort: null, judgeEffort: null, verbosity: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--case') options.caseIds = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (value === '--runs') options.runs = Number(argv[++i]);
    else if (value === '--model') options.model = argv[++i];
    else if (value === '--judge-model') options.judgeModel = argv[++i];
    else if (value === '--effort') options.effort = argv[++i];
    else if (value === '--judge-effort') options.judgeEffort = argv[++i];
    else if (value === '--verbosity') options.verbosity = argv[++i];
    else if (value === '--help' || value === '-h') options.help = true;
    else throw new Error(`unknown argument '${value}'`);
  }
  if (options.help) return options;
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer');
  if (!options.effort || !options.judgeEffort) throw new Error('--effort and --judge-effort are required');
  for (const [flag, level] of [['--effort', options.effort], ['--judge-effort', options.judgeEffort]]) {
    if (!EFFORTS.includes(level)) throw new Error(`${flag} must be one of ${EFFORTS.join(', ')}`);
  }
  if (options.verbosity !== null && !VERBOSITIES.includes(options.verbosity)) {
    throw new Error(`--verbosity must be one of ${VERBOSITIES.join(', ')}`);
  }
  return options;
}

export function readCases() {
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

export function promptFor(testCase, byId) {
  if (!testCase.follows) return testCase.prompt;
  const parent = byId.get(testCase.follows);
  if (!parent) throw new Error(`${testCase.id}: follows unknown case '${testCase.follows}'`);
  return `Earlier in this conversation I asked: "${promptFor(parent, byId)}"\n\n${testCase.prompt}`;
}

// The Codex sandbox is read-only, so a fixture is shown in the prompt instead
// of written to the working directory.
export function fixturePrompt(testCase) {
  const files = Object.entries(testCase.fixture?.files ?? {});
  if (!files.length) return '';
  return `The developer's project contains these files:\n\n` +
    files.map(([path, contents]) => `--- ${path} ---\n${contents}${contents.endsWith('\n') ? '' : '\n'}`).join('\n') + '\n';
}

// Regex checks on the final message run here too. Other checks (tool use,
// trace, and written files) need Claude Code's harness, and skill_loaded
// doesn't apply because this runner tells Codex to read the skill.
export function deterministicChecks(testCase, response) {
  return (testCase.checks ?? []).map((check) => {
    if (check.type !== 'regex' || (check.target ?? 'last_message') !== 'last_message') {
      return { name: check.name, skipped: true };
    }
    const flags = (check.flags ?? '').replace(/[^imsuv]/g, '');
    const count = (response.match(new RegExp(check.pattern, `${flags}g`)) ?? []).length;
    const match = check.match ?? 'contains';
    const pass = match === 'contains' ? count > 0
      : match === 'not_contains' ? count === 0
        : count === Number(match.slice('count:'.length));
    return { name: check.name, pass };
  });
}

function skillPrompt(testCase) {
  if (testCase.id.startsWith('plugins-')) {
    return `You are answering a user with the InfluxDB 3 Processing Engine plugins skill from this checked-out repository. ` +
      `Before answering, read skills/influxdb3-plugins/SKILL.md and any references it routes you to. `;
  }
  return `You are answering a user with the InfluxDB 3 skill from this checked-out repository. ` +
    `Before answering, read skills/influxdb3/SKILL.md and any references it routes you to. `;
}

export function codexCommand({ prompt, outputPath, model, effort, verbosity, schemaPath }) {
  const command = ['exec', '--ephemeral', '--ignore-user-config', '--json', '--sandbox', 'read-only', '--cd', repoDir,
    '--output-last-message', outputPath, '--model', model, '-c', `model_reasoning_effort="${effort}"`];
  if (verbosity) command.push('-c', `model_verbosity="${verbosity}"`);
  if (schemaPath) command.push('--output-schema', schemaPath);
  command.push(prompt);
  return command;
}

function runCodex({ tracePath, ...options }) {
  const command = codexCommand(options);
  const result = spawnSync('codex', command, { cwd: repoDir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  writeFileSync(tracePath, result.stdout ?? '', 'utf8');
  if (result.stderr) writeFileSync(`${tracePath}.stderr`, result.stderr, 'utf8');
  return { exitCode: result.status ?? 1, error: result.error?.message };
}

function evaluatorPrompt(testCase, response) {
  const numberedCriteria = testCase.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  return `You are a strict evaluator. Grade the assistant response to the user prompt against every criterion below.\n\n` +
    `User prompt:\n${promptFor(testCase, byId)}\n\nCriteria:\n${numberedCriteria}\n\nAssistant response:\n${response}\n\n` +
    `Return JSON only. Include exactly one check for each criterion, using consecutive ids starting at 1. ` +
    `Set pass to true only when every criterion passes. Evidence must cite the response without exposing any secret-like value.`;
}

function grade(testCase, response, resultDir, runNumber, options) {
  const responsePath = join(resultDir, `${testCase.id}.run-${runNumber}.response.txt`);
  const judgePath = join(resultDir, `${testCase.id}.run-${runNumber}.judge.json`);
  writeFileSync(responsePath, response, 'utf8');
  const execution = runCodex({
    prompt: evaluatorPrompt(testCase, response),
    tracePath: join(resultDir, `${testCase.id}.run-${runNumber}.judge.trace.jsonl`),
    outputPath: judgePath,
    model: options.judgeModel,
    effort: options.judgeEffort,
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

let byId;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
  }
  if (options.help) usage();
  const allCases = readCases();
  byId = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const cases = options.caseIds
    ? options.caseIds.map((id) => byId.get(id) ?? usage(`unknown case '${id}'`))
    : allCases;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultDir = join(evalsDir, 'results', `codex-${timestamp}-${process.pid}`);
  mkdirSync(resultDir, { recursive: true });
  const results = [];

  for (const testCase of cases) {
    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      const execution = runCodex({
        prompt: skillPrompt(testCase) +
          `Do not edit files or contact a live service. You may read local skill and reference files. Answer the following request directly:\n\n${fixturePrompt(testCase)}${promptFor(testCase, byId)}`,
        tracePath: join(resultDir, `${testCase.id}.run-${runNumber}.trace.jsonl`),
        outputPath: join(resultDir, `${testCase.id}.run-${runNumber}.answer.txt`),
        model: options.model,
        effort: options.effort,
        verbosity: options.verbosity,
      });
      const answerPath = join(resultDir, `${testCase.id}.run-${runNumber}.answer.txt`);
      if (execution.exitCode !== 0 || !existsSync(answerPath)) {
        results.push({ id: testCase.id, run: runNumber, pass: false, reason: `agent failed (exit ${execution.exitCode})`, execution });
        continue;
      }
      const response = readFileSync(answerPath, 'utf8');
      const checks = deterministicChecks(testCase, response);
      const judged = grade(testCase, response, resultDir, runNumber, options);
      const checksPass = checks.every((check) => check.skipped || check.pass);
      results.push({ id: testCase.id, run: runNumber, ...judged, pass: judged.pass && checksPass, checks });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    model: options.model,
    judgeModel: options.judgeModel,
    effort: options.effort,
    judgeEffort: options.judgeEffort,
    // null: the model's default verbosity, with the user config ignored.
    verbosity: options.verbosity,
    runs: options.runs,
    results,
  };
  writeFileSync(join(resultDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const passed = results.filter((result) => result.pass).length;
  console.log(`${passed}/${results.length} Codex eval runs passed. Results: ${resultDir}`);
  process.exit(passed === results.length ? 0 : 1);
}
