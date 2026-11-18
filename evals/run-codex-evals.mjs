#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFilesAsPromptText, readCases, userPromptWithEarlierTurns } from './cases.mjs';
import { judgePrompt, requestVerdictOrError } from './judge.mjs';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evalsDir = join(repoDir, 'evals');

const USAGE = 'Usage: node evals/run-codex-evals.mjs --effort LEVEL --judge-effort LEVEL [--verbosity LEVEL] ' +
  '[--case id[,id...]] [--runs N] [--model MODEL] [--judge-model MODEL]';
const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const JUDGE_EFFORTS_BY_HARNESS = { claude: [...CODEX_EFFORTS, 'max'], codex: CODEX_EFFORTS };
const CODEX_VERBOSITIES = ['low', 'medium', 'high'];

function exitWithUsage(errorMessage) {
  if (errorMessage) console.error(`Error: ${errorMessage}\n`);
  console.error(USAGE);
  process.exit(errorMessage ? 2 : 0);
}

export function parseArgs(argv) {
  const options = { caseIds: null, runs: 1, model: 'gpt-6.1-sol', judgeModel: 'claude-opus-5-5', effort: null, judgeEffort: null, verbosity: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--case') options.caseIds = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (flag === '--runs') options.runs = Number(argv[++i]);
    else if (flag === '--model') options.model = argv[++i];
    else if (flag === '--judge-model') options.judgeModel = argv[++i];
    else if (flag === '--effort') options.effort = argv[++i];
    else if (flag === '--judge-effort') options.judgeEffort = argv[++i];
    else if (flag === '--verbosity') options.verbosity = argv[++i];
    else if (flag === '--help' || flag === '-h') options.help = true;
    else throw new Error(`unknown argument '${flag}'`);
  }
  if (options.help) return options;
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer');
  if (!options.effort || !options.judgeEffort) throw new Error('--effort and --judge-effort are required');
  if (!CODEX_EFFORTS.includes(options.effort)) throw new Error(`--effort must be one of ${CODEX_EFFORTS.join(', ')}`);
  const judgeEfforts = JUDGE_EFFORTS_BY_HARNESS[harnessForJudgeModel(options.judgeModel)];
  if (!judgeEfforts.includes(options.judgeEffort)) throw new Error(`--judge-effort must be one of ${judgeEfforts.join(', ')}`);
  if (options.verbosity !== null && !CODEX_VERBOSITIES.includes(options.verbosity)) {
    throw new Error(`--verbosity must be one of ${CODEX_VERBOSITIES.join(', ')}`);
  }
  return options;
}

export function harnessForJudgeModel(judgeModel) {
  return judgeModel.startsWith('claude-') ? 'claude' : 'codex';
}

export function runFinalMessageRegexChecksAndSkipOthers(testCase, finalMessage) {
  return (testCase.checks ?? []).map((check) => {
    if (check.type !== 'regex' || (check.target ?? 'last_message') !== 'last_message') {
      return { name: check.name, skipped: true };
    }
    const flags = (check.flags ?? '').replace(/[^imsuv]/g, '');
    const matchCount = (finalMessage.match(new RegExp(check.pattern, `${flags}g`)) ?? []).length;
    const matchRule = check.match ?? 'contains';
    const pass = matchRule === 'contains' ? matchCount > 0
      : matchRule === 'not_contains' ? matchCount === 0
        : matchCount === Number(matchRule.slice('count:'.length));
    return { name: check.name, pass };
  });
}

function readSkillInstruction(testCase) {
  if (testCase.id.startsWith('plugins-')) {
    return `You are answering a user with the InfluxDB 3 Processing Engine plugins skill from this checked-out repository. ` +
      `Before answering, read skills/influxdb3-plugins/SKILL.md and any references it routes you to. `;
  }
  return `You are answering a user with the InfluxDB 3 skill from this checked-out repository. ` +
    `Before answering, read skills/influxdb3/SKILL.md and any references it routes you to. `;
}

export function codexAnswerCommand({ prompt, answerPath, model, effort, verbosity }) {
  const args = ['exec', '--ephemeral', '--ignore-user-config', '--json', '--sandbox', 'read-only', '--cd', repoDir,
    '--output-last-message', answerPath, '--model', model, '-c', `model_reasoning_effort="${effort}"`];
  if (verbosity) args.push('-c', `model_verbosity="${verbosity}"`);
  args.push(prompt);
  return args;
}

function runCodexAnswer({ tracePath, ...answerSettings }) {
  const processResult = spawnSync('codex', codexAnswerCommand(answerSettings), { cwd: repoDir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  writeFileSync(tracePath, processResult.stdout ?? '', 'utf8');
  if (processResult.stderr) writeFileSync(`${tracePath}.stderr`, processResult.stderr, 'utf8');
  return { exitCode: processResult.status ?? 1, error: processResult.error?.message };
}

async function judgeAnswerOrReportJudgeFailure(testCase, casesById, answerText, resultDir, runNumber, options) {
  writeFileSync(join(resultDir, `${testCase.id}.run-${runNumber}.response.txt`), answerText, 'utf8');
  const judgeSettings = { harness: harnessForJudgeModel(options.judgeModel), model: options.judgeModel, effort: options.judgeEffort };
  const verdict = await requestVerdictOrError(judgeSettings, judgePrompt(testCase, casesById, answerText), testCase.criteria.length);
  writeFileSync(join(resultDir, `${testCase.id}.run-${runNumber}.judge.json`), `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
  if (verdict.error) return { pass: false, reason: `judge failed: ${verdict.error.slice(0, 500)}` };
  const { pass, checks, summary } = verdict;
  return { pass: pass === true && checks.every((check) => check.pass), judgement: { pass, checks, summary } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    exitWithUsage(error.message);
  }
  if (options.help) exitWithUsage();
  const allCases = readCases();
  const casesById = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const selectedCases = options.caseIds
    ? options.caseIds.map((id) => casesById.get(id) ?? exitWithUsage(`unknown case '${id}'`))
    : allCases;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultDir = join(evalsDir, 'results', `codex-${timestamp}-${process.pid}`);
  mkdirSync(resultDir, { recursive: true });
  const results = [];

  for (const testCase of selectedCases) {
    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      const answerPath = join(resultDir, `${testCase.id}.run-${runNumber}.answer.txt`);
      const execution = runCodexAnswer({
        prompt: readSkillInstruction(testCase) +
          `Do not edit files or contact a live service. You may read local skill and reference files. Answer the following request directly:\n\n` +
          `${fixtureFilesAsPromptText(testCase)}${userPromptWithEarlierTurns(testCase, casesById)}`,
        tracePath: join(resultDir, `${testCase.id}.run-${runNumber}.trace.jsonl`),
        answerPath,
        model: options.model,
        effort: options.effort,
        verbosity: options.verbosity,
      });
      if (execution.exitCode !== 0 || !existsSync(answerPath)) {
        results.push({ id: testCase.id, run: runNumber, pass: false, reason: `agent failed (exit ${execution.exitCode})`, execution });
        continue;
      }
      const answerText = readFileSync(answerPath, 'utf8');
      const checks = runFinalMessageRegexChecksAndSkipOthers(testCase, answerText);
      const judged = await judgeAnswerOrReportJudgeFailure(testCase, casesById, answerText, resultDir, runNumber, options);
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
    verbosity: options.verbosity,
    runs: options.runs,
    results,
  };
  writeFileSync(join(resultDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const passedCount = results.filter((result) => result.pass).length;
  console.log(`${passedCount}/${results.length} Codex eval runs passed. Results: ${resultDir}`);
  process.exit(passedCount === results.length ? 0 : 1);
}
