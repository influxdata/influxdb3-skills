#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCases, userPromptWithEarlierTurns } from './cases.mjs';
import { judgePrompt, requestVerdictOrError } from './judge.mjs';

const evalsDir = dirname(fileURLToPath(import.meta.url));
const JUDGE_HARNESSES = ['claude', 'codex'];
const JUDGE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const SAFETY_REFUSAL_PATTERN = /safeguard|usage policy|\baup\b|flagged/i;

export function parseArgs(argv) {
  const [command, ...flags] = argv;
  const options = { command, outDir: null, answerSources: [], judges: [], caseIds: null, votesPerJudge: 3, concurrency: 4, force: false, dryRun: false };
  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    const nextValue = () => flags[++i] ?? '';
    if (flag === '--out') options.outDir = nextValue();
    else if (flag === '--answers') {
      const labelAndPath = nextValue();
      const equalsIndex = labelAndPath.indexOf('=');
      const path = equalsIndex < 0 ? labelAndPath : labelAndPath.slice(equalsIndex + 1);
      const label = equalsIndex < 0 ? basename(path).replace(/\.json$/, '') : labelAndPath.slice(0, equalsIndex);
      options.answerSources.push({ label, path });
    } else if (flag === '--judge') {
      const [harness, model, effort] = nextValue().split(':');
      if (!JUDGE_HARNESSES.includes(harness) || !model || !JUDGE_EFFORTS.includes(effort)) {
        throw new Error(`--judge takes harness:model:effort, with harness ${JUDGE_HARNESSES.join('|')} and effort ${JUDGE_EFFORTS.join('|')}`);
      }
      options.judges.push({ harness, model, effort, slug: `${harness}_${model}_${effort}` });
    } else if (flag === '--case') options.caseIds = nextValue().split(',').filter(Boolean);
    else if (flag === '--votes') options.votesPerJudge = Number(nextValue());
    else if (flag === '--concurrency') options.concurrency = Number(nextValue());
    else if (flag === '--force') options.force = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else throw new Error(`unknown argument '${flag}'`);
  }
  if (!['judge', 'triage', 'score'].includes(command)) throw new Error('command must be judge, triage, or score');
  if (!options.outDir) throw new Error('--out is required');
  if (command === 'judge') {
    if (!options.answerSources.length || !options.judges.length) throw new Error('judge needs --answers and --judge');
    for (const [flag, value] of [['--votes', options.votesPerJudge], ['--concurrency', options.concurrency]]) {
      if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} must be a positive integer`);
    }
  }
  return options;
}

export function loadStoredAnswers(sourceLabel, resultPath) {
  const answers = [];
  if (resultPath.endsWith('.json')) {
    for (const claudeCase of JSON.parse(readFileSync(resultPath, 'utf8')).cases) {
      claudeCase.arms.with.forEach((claudeRun, runIndex) => {
        const finalMessage = claudeRun.graders?.find((grader) => grader.name === 'criteria')?.evidence;
        if (typeof finalMessage === 'string' && finalMessage.trim()) {
          answers.push({ source: sourceLabel, id: claudeCase.name, run: runIndex + 1, text: finalMessage });
        }
      });
    }
    return answers;
  }
  for (const codexResult of JSON.parse(readFileSync(join(resultPath, 'summary.json'), 'utf8')).results) {
    const answerPath = join(resultPath, `${codexResult.id}.run-${codexResult.run}.answer.txt`);
    if (existsSync(answerPath)) {
      answers.push({ source: sourceLabel, id: codexResult.id, run: codexResult.run, text: readFileSync(answerPath, 'utf8') });
    }
  }
  return answers;
}

const answerKey = (answer) => `${answer.source}/${answer.id}.run-${answer.run}`;
const votePath = (outDir, judgeSlug, answer, voteNumber) => join(outDir, 'votes', judgeSlug, `${answerKey(answer)}.vote-${voteNumber}.json`);

async function requestMissingVotes(options) {
  const casesById = new Map(readCases().map((testCase) => [testCase.id, testCase]));
  for (const id of options.caseIds ?? []) if (!casesById.has(id)) throw new Error(`unknown case '${id}'`);
  const isJudgedAndSelected = (id) => casesById.get(id)?.criteria?.length && (!options.caseIds || options.caseIds.includes(id));
  const answers = options.answerSources.flatMap(({ label, path }) => loadStoredAnswers(label, path))
    .filter((answer) => isJudgedAndSelected(answer.id))
    .map((answer) => ({ ...answer, criteria: casesById.get(answer.id).criteria }));
  const missingVotes = [];
  for (const judge of options.judges) {
    for (const answer of answers) {
      for (let voteNumber = 1; voteNumber <= options.votesPerJudge; voteNumber += 1) {
        const path = votePath(options.outDir, judge.slug, answer, voteNumber);
        if (!existsSync(path)) missingVotes.push({ judge, answer, path });
      }
    }
  }
  console.log(`${answers.length} answers, ${options.judges.length} judges, ${missingVotes.length} judge calls to make.`);
  if (options.dryRun) return;
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, 'answers.json'), `${JSON.stringify(answers, null, 2)}\n`);
  writeFileSync(join(options.outDir, 'config.json'), `${JSON.stringify({
    answers: options.answerSources, judges: options.judges, votes: options.votesPerJudge, caseIds: options.caseIds,
    prompts_sha256: createHash('sha256').update(readFileSync(join(evalsDir, 'prompts.jsonl'))).digest('hex'),
  }, null, 2)}\n`);

  let nextVoteIndex = 0;
  let completedCount = 0;
  const requestVotesUntilNoneLeft = async () => {
    while (nextVoteIndex < missingVotes.length) {
      const { judge, answer, path } = missingVotes[nextVoteIndex++];
      const verdict = await requestVerdictOrError(judge, judgePrompt(casesById.get(answer.id), casesById, answer.text), answer.criteria.length);
      const errorPath = path.replace(/\.json$/, '.error.txt');
      mkdirSync(dirname(path), { recursive: true });
      if (verdict.error) writeFileSync(errorPath, verdict.error);
      else {
        writeFileSync(path, `${JSON.stringify(verdict, null, 2)}\n`);
        rmSync(errorPath, { force: true });
      }
      completedCount += 1;
      if (completedCount % 20 === 0 || completedCount === missingVotes.length) console.log(`${completedCount}/${missingVotes.length} calls`);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, requestVotesUntilNoneLeft));
}

export function readVotesByJudgeAndAnswer(outDir) {
  const votesByJudge = {};
  const votesDir = join(outDir, 'votes');
  if (!existsSync(votesDir)) return votesByJudge;
  for (const judgeSlug of readdirSync(votesDir)) {
    votesByJudge[judgeSlug] = {};
    for (const relativePath of readdirSync(join(votesDir, judgeSlug), { recursive: true })) {
      const voteFile = String(relativePath).match(/^(.+)\.vote-\d+\.(json|error\.txt)$/);
      if (!voteFile) continue;
      const [, key, extension] = voteFile;
      const contents = readFileSync(join(votesDir, judgeSlug, String(relativePath)), 'utf8');
      (votesByJudge[judgeSlug][key] ??= []).push(extension === 'json' ? JSON.parse(contents) : { error: contents });
    }
  }
  return votesByJudge;
}

export function majorityVerdictOrNull(votes, criterionIndex) {
  const passes = votes.filter((vote) => !vote.error).map((vote) => vote.checks[criterionIndex].pass);
  const passCount = passes.filter(Boolean).length;
  if (passCount * 2 > passes.length) return true;
  if ((passes.length - passCount) * 2 > passes.length) return false;
  return null;
}

export function majorityVerdictsPerCriterion(answers, votesByJudge) {
  const judgeSlugs = Object.keys(votesByJudge).sort();
  const criterionItems = [];
  for (const answer of answers) {
    answer.criteria.forEach((criterion, criterionIndex) => {
      const majorityByJudge = Object.fromEntries(judgeSlugs.map((judgeSlug) =>
        [judgeSlug, majorityVerdictOrNull(votesByJudge[judgeSlug][answerKey(answer)] ?? [], criterionIndex)]));
      const majorities = Object.values(majorityByJudge);
      const isSplit = majorities.includes(null) || new Set(majorities).size > 1;
      const key = `${answerKey(answer)}#${criterionIndex + 1}`;
      const id = `S-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
      criterionItems.push({ id, key, answer, criterionIndex, criterion, majorityByJudge, isSplit });
    });
  }
  return { judgeSlugs, criterionItems };
}

function judgesInOrderFixedByItemId(judgeSlugs, itemId) {
  return judgeSlugs.map((judgeSlug) => [createHash('sha256').update(`${itemId}${judgeSlug}`).digest('hex'), judgeSlug])
    .sort().map(([, judgeSlug]) => judgeSlug);
}

export function parseMaintainerLabels(splitSheetMarkdown) {
  const passByItemId = {};
  let currentItemId = null;
  for (const line of splitSheetMarkdown.split('\n')) {
    const heading = line.match(/^### (S-[0-9a-f]{8})\b/);
    if (heading) currentItemId = heading[1];
    const label = line.match(/^Label:\s*([PF])\b/i);
    if (label && currentItemId) passByItemId[currentItemId] = label[1].toUpperCase() === 'P';
  }
  return passByItemId;
}

function writeSplitSheet(options) {
  const sheetPath = join(options.outDir, 'split.md');
  if (existsSync(sheetPath) && Object.keys(parseMaintainerLabels(readFileSync(sheetPath, 'utf8'))).length && !options.force) {
    throw new Error(`${sheetPath} already has labels; pass --force to rebuild it`);
  }
  const answers = JSON.parse(readFileSync(join(options.outDir, 'answers.json'), 'utf8'));
  const votesByJudge = readVotesByJudgeAndAnswer(options.outDir);
  const casesById = new Map(readCases().map((testCase) => [testCase.id, testCase]));
  const { judgeSlugs, criterionItems } = majorityVerdictsPerCriterion(answers, votesByJudge);
  const splitItems = criterionItems.filter((item) => item.isSplit);
  const sections = splitItems.map((item) => {
    const readerLines = judgesInOrderFixedByItemId(judgeSlugs, item.id).map((judgeSlug, readerIndex) => {
      const majority = item.majorityByJudge[judgeSlug];
      const voteMatchingMajority = (votesByJudge[judgeSlug][answerKey(item.answer)] ?? [])
        .find((vote) => !vote.error && vote.checks[item.criterionIndex].pass === majority);
      const majorityText = majority === null ? 'NO MAJORITY' : majority ? 'PASS' : 'FAIL';
      const evidence = voteMatchingMajority ? ` — ${voteMatchingMajority.checks[item.criterionIndex].evidence}` : '';
      return `- Reader ${readerIndex + 1}: ${majorityText}${evidence}`;
    });
    return [`### ${item.id} · \`${item.answer.id}\``, '',
      `**User prompt:** ${userPromptWithEarlierTurns(casesById.get(item.answer.id), casesById)}`, '',
      `**Criterion ${item.criterionIndex + 1}:** ${item.criterion}`, '', '<details><summary>Answer</summary>', '', '````text', item.answer.text, '````', '',
      '</details>', '', ...readerLines, '', 'Label: ', ''].join('\n');
  });
  writeFileSync(sheetPath, [`# Split verdicts: ${splitItems.length} of ${criterionItems.length} criteria`, '',
    'For each item, read the answer and write `Label: P` if it meets the criterion or `Label: F` if it does not. ' +
    'Readers are the candidate judges, in a different order for each item.', '', ...sections].join('\n'));
  writeFileSync(join(options.outDir, 'split-key.json'),
    `${JSON.stringify(Object.fromEntries(splitItems.map((item) => [item.id, item.key])), null, 2)}\n`);
  console.log(`${splitItems.length} of ${criterionItems.length} criteria split. Sheet: ${sheetPath}`);
}

export function scoreJudgesAgainstLabelsAndOtherJudges(criterionItems, votesByJudge, passByItemId) {
  const scoresByJudge = {};
  for (const judgeSlug of Object.keys(votesByJudge).sort()) {
    const score = {
      labeledItems: 0, matchesLabel: 0, itemsWhereOthersAgree: 0, matchesOthers: 0, itemsWithSeveralVotes: 0, unanimousItems: 0,
      calls: 0, errors: 0, safetyRefusals: 0, costUsd: 0,
    };
    for (const votes of Object.values(votesByJudge[judgeSlug])) {
      for (const vote of votes) {
        score.calls += 1;
        if (vote.error) {
          score.errors += 1;
          if (SAFETY_REFUSAL_PATTERN.test(vote.error)) score.safetyRefusals += 1;
        } else score.costUsd += vote.costUsd ?? 0;
      }
    }
    for (const item of criterionItems) {
      const majority = item.majorityByJudge[judgeSlug];
      const validVotes = (votesByJudge[judgeSlug][answerKey(item.answer)] ?? []).filter((vote) => !vote.error);
      if (validVotes.length > 1) {
        score.itemsWithSeveralVotes += 1;
        if (new Set(validVotes.map((vote) => vote.checks[item.criterionIndex].pass)).size === 1) score.unanimousItems += 1;
      }
      if (item.isSplit && item.id in passByItemId) {
        score.labeledItems += 1;
        if (majority === passByItemId[item.id]) score.matchesLabel += 1;
      }
      const otherMajorities = Object.entries(item.majorityByJudge).filter(([otherSlug]) => otherSlug !== judgeSlug).map(([, value]) => value);
      if (otherMajorities.length && !otherMajorities.includes(null) && new Set(otherMajorities).size === 1) {
        score.itemsWhereOthersAgree += 1;
        if (majority === otherMajorities[0]) score.matchesOthers += 1;
      }
    }
    scoresByJudge[judgeSlug] = score;
  }
  return scoresByJudge;
}

function writeJudgeReport(options) {
  const answers = JSON.parse(readFileSync(join(options.outDir, 'answers.json'), 'utf8'));
  const votesByJudge = readVotesByJudgeAndAnswer(options.outDir);
  const { criterionItems } = majorityVerdictsPerCriterion(answers, votesByJudge);
  const sheetPath = join(options.outDir, 'split.md');
  const passByItemId = existsSync(sheetPath) ? parseMaintainerLabels(readFileSync(sheetPath, 'utf8')) : {};
  const splitCount = criterionItems.filter((item) => item.isSplit).length;
  const scoresByJudge = scoreJudgesAgainstLabelsAndOtherJudges(criterionItems, votesByJudge, passByItemId);
  const fraction = (count, total) => (total ? `${count}/${total} (${Math.round((100 * count) / total)}%)` : 'n/a');
  const table = ['| Judge | Matches labels | Matches the other judges | All votes agree | Errors (safety) | Cost (USD) |', '|---|---|---|---|---|---|',
    ...Object.entries(scoresByJudge).map(([judgeSlug, score]) =>
      `| \`${judgeSlug}\` | ${fraction(score.matchesLabel, score.labeledItems)} | ${fraction(score.matchesOthers, score.itemsWhereOthersAgree)} | ` +
      `${fraction(score.unanimousItems, score.itemsWithSeveralVotes)} | ${score.errors}/${score.calls} (${score.safetyRefusals}) | ` +
      `${score.costUsd ? score.costUsd.toFixed(2) : 'not reported'} |`)];
  const report = [`# Judge comparison`, '', `${criterionItems.length} criteria; ${splitCount} split; ${Object.keys(passByItemId).length} labeled.`, '',
    ...table, '',
    '"Matches the other judges" counts the criteria where every other judge reached the same majority verdict. ' +
    'A miss means this judge alone disagreed.', '', 'Codex calls report token usage in the vote files, not dollars.', ''].join('\n');
  writeFileSync(join(options.outDir, 'report.md'), report);
  console.log(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'judge') await requestMissingVotes(options);
    else if (options.command === 'triage') writeSplitSheet(options);
    else writeJudgeReport(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
