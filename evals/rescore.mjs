#!/usr/bin/env node
// Re-score stored eval answers with candidate judges, list the criteria they
// split on, and score each judge against a maintainer's labels (#49, step 3).
// Inputs stay fixed: the answers come from stored result files, and the
// criteria come from the current prompts.jsonl.
//
//   node evals/rescore.mjs judge --out evals/results/rescore-0.7.4 \
//     --answers opus-79dee1f=evals/results/claude-opus-79dee1f.json \
//     --answers sol-79dee1f=evals/results/codex-<timestamp> \
//     --judge claude:claude-opus-5-5:medium --judge codex:gpt-6-astra:low \
//     [--case id[,id...]] [--votes 3] [--concurrency 4] [--dry-run]
//   node evals/rescore.mjs triage --out evals/results/rescore-0.7.4 [--force]
//   node evals/rescore.mjs score --out evals/results/rescore-0.7.4
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptFor, readCases } from './cases.mjs';
import { callJudge, judgePrompt } from './judge.mjs';

const evalsDir = dirname(fileURLToPath(import.meta.url));
const HARNESSES = ['claude', 'codex'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const SAFETY = /safeguard|usage policy|\baup\b|flagged/i;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, out: null, answers: [], judges: [], caseIds: null, votes: 3, concurrency: 4, force: false, dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = () => rest[++i] ?? '';
    if (flag === '--out') options.out = value();
    else if (flag === '--answers') {
      const raw = value();
      const at = raw.indexOf('=');
      const path = at < 0 ? raw : raw.slice(at + 1);
      options.answers.push({ label: at < 0 ? basename(path).replace(/\.json$/, '') : raw.slice(0, at), path });
    } else if (flag === '--judge') {
      const [harness, model, effort] = value().split(':');
      if (!HARNESSES.includes(harness) || !model || !EFFORTS.includes(effort)) {
        throw new Error(`--judge takes harness:model:effort, with harness ${HARNESSES.join('|')} and effort ${EFFORTS.join('|')}`);
      }
      options.judges.push({ harness, model, effort, slug: `${harness}_${model}_${effort}` });
    } else if (flag === '--case') options.caseIds = value().split(',').filter(Boolean);
    else if (flag === '--votes') options.votes = Number(value());
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--force') options.force = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else throw new Error(`unknown argument '${flag}'`);
  }
  if (!['judge', 'triage', 'score'].includes(command)) throw new Error('command must be judge, triage, or score');
  if (!options.out) throw new Error('--out is required');
  if (command === 'judge') {
    if (!options.answers.length || !options.judges.length) throw new Error('judge needs --answers and --judge');
    for (const key of ['votes', 'concurrency']) {
      if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`--${key} must be a positive integer`);
    }
  }
  return options;
}

// A Claude Code result file stores each run's final message as the criteria
// grader's evidence. A Codex result directory stores it in <id>.run-<n>.answer.txt.
export function loadAnswers(label, path) {
  const answers = [];
  if (path.endsWith('.json')) {
    for (const testCase of JSON.parse(readFileSync(path, 'utf8')).cases) {
      testCase.arms.with.forEach((run, index) => {
        const text = run.graders?.find((grader) => grader.name === 'criteria')?.evidence;
        if (typeof text === 'string' && text.trim()) answers.push({ source: label, id: testCase.name, run: index + 1, text });
      });
    }
    return answers;
  }
  for (const result of JSON.parse(readFileSync(join(path, 'summary.json'), 'utf8')).results) {
    const file = join(path, `${result.id}.run-${result.run}.answer.txt`);
    if (existsSync(file)) answers.push({ source: label, id: result.id, run: result.run, text: readFileSync(file, 'utf8') });
  }
  return answers;
}

const answerKey = (answer) => `${answer.source}/${answer.id}.run-${answer.run}`;
const votePath = (out, judge, answer, vote) => join(out, 'votes', judge, `${answerKey(answer)}.vote-${vote}.json`);

async function judgeAll(options) {
  const cases = new Map(readCases().map((testCase) => [testCase.id, testCase]));
  for (const id of options.caseIds ?? []) if (!cases.has(id)) throw new Error(`unknown case '${id}'`);
  const wanted = (id) => cases.get(id)?.criteria?.length && (!options.caseIds || options.caseIds.includes(id));
  const answers = options.answers.flatMap(({ label, path }) => loadAnswers(label, path)).filter((answer) => wanted(answer.id))
    .map((answer) => ({ ...answer, criteria: cases.get(answer.id).criteria }));
  // A vote file that exists is kept, so a stopped run resumes where it left off.
  const tasks = [];
  for (const judge of options.judges) {
    for (const answer of answers) {
      for (let vote = 1; vote <= options.votes; vote += 1) {
        const path = votePath(options.out, judge.slug, answer, vote);
        if (!existsSync(path)) tasks.push({ judge, answer, path });
      }
    }
  }
  console.log(`${answers.length} answers, ${options.judges.length} judges, ${tasks.length} judge calls to make.`);
  if (options.dryRun) return;
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, 'answers.json'), `${JSON.stringify(answers, null, 2)}\n`);
  writeFileSync(join(options.out, 'config.json'), `${JSON.stringify({
    answers: options.answers, judges: options.judges, votes: options.votes, caseIds: options.caseIds,
    prompts_sha256: createHash('sha256').update(readFileSync(join(evalsDir, 'prompts.jsonl'))).digest('hex'),
  }, null, 2)}\n`);

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const { judge, answer, path } = tasks[next++];
      const verdict = await callJudge(judge, judgePrompt(cases.get(answer.id), cases, answer.text), answer.criteria.length);
      const errorPath = path.replace(/\.json$/, '.error.txt');
      mkdirSync(dirname(path), { recursive: true });
      if (verdict.error) writeFileSync(errorPath, verdict.error);
      else {
        writeFileSync(path, `${JSON.stringify(verdict, null, 2)}\n`);
        rmSync(errorPath, { force: true });
      }
      done += 1;
      if (done % 20 === 0 || done === tasks.length) console.log(`${done}/${tasks.length} calls`);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
}

// Reads every judge's votes as { [judge]: { [answerKey]: [verdict, ...] } }.
export function readVotes(out) {
  const votes = {};
  const root = join(out, 'votes');
  if (!existsSync(root)) return votes;
  for (const judge of readdirSync(root)) {
    votes[judge] = {};
    for (const file of readdirSync(join(root, judge), { recursive: true })) {
      const match = String(file).match(/^(.+)\.vote-\d+\.(json|error\.txt)$/);
      if (!match) continue;
      const text = readFileSync(join(root, judge, String(file)), 'utf8');
      (votes[judge][match[1]] ??= []).push(match[2] === 'json' ? JSON.parse(text) : { error: text });
    }
  }
  return votes;
}

// One judge's verdict on one criterion: the strict majority of its valid votes,
// or null when the votes tie or none are valid.
export function majority(verdicts, index) {
  const passes = verdicts.filter((verdict) => !verdict.error).map((verdict) => verdict.checks[index].pass);
  const yes = passes.filter(Boolean).length;
  if (yes * 2 > passes.length) return true;
  if ((passes.length - yes) * 2 > passes.length) return false;
  return null;
}

// Every judged criterion of every answer, with each judge's majority verdict.
// An item is split when any judge has no majority or the judges disagree.
export function triage(answers, votes) {
  const judges = Object.keys(votes).sort();
  const items = [];
  for (const answer of answers) {
    answer.criteria.forEach((criterion, index) => {
      const verdicts = Object.fromEntries(judges.map((judge) => [judge, majority(votes[judge][answerKey(answer)] ?? [], index)]));
      const values = Object.values(verdicts);
      const split = values.includes(null) || new Set(values).size > 1;
      const key = `${answerKey(answer)}#${index + 1}`;
      const id = `S-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
      items.push({ id, key, answer, index, criterion, verdicts, split });
    });
  }
  return { judges, items };
}

// Show readers in an order fixed by the item ID, so the sheet doesn't reveal
// which reader is which judge, and rebuilding it gives the same sheet.
function shuffled(judges, id) {
  return judges.map((judge) => [createHash('sha256').update(`${id}${judge}`).digest('hex'), judge]).sort().map(([, judge]) => judge);
}

export function parseLabels(markdown) {
  const labels = {};
  let current = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^### (S-[0-9a-f]{8})\b/);
    if (heading) current = heading[1];
    const label = line.match(/^Label:\s*([PF])\b/i);
    if (label && current) labels[current] = label[1].toUpperCase() === 'P';
  }
  return labels;
}

function writeSheet(options) {
  const sheetPath = join(options.out, 'split.md');
  if (existsSync(sheetPath) && Object.keys(parseLabels(readFileSync(sheetPath, 'utf8'))).length && !options.force) {
    throw new Error(`${sheetPath} already has labels; pass --force to rebuild it`);
  }
  const answers = JSON.parse(readFileSync(join(options.out, 'answers.json'), 'utf8'));
  const votes = readVotes(options.out);
  const cases = new Map(readCases().map((testCase) => [testCase.id, testCase]));
  const { judges, items } = triage(answers, votes);
  const splits = items.filter((item) => item.split);
  const sections = splits.map((item) => {
    const readers = shuffled(judges, item.id).map((judge, n) => {
      const verdict = item.verdicts[judge];
      const evidence = (votes[judge][answerKey(item.answer)] ?? []).find((vote) => !vote.error && vote.checks[item.index].pass === verdict);
      const label = verdict === null ? 'NO MAJORITY' : verdict ? 'PASS' : 'FAIL';
      return `- Reader ${n + 1}: ${label}${evidence ? ` — ${evidence.checks[item.index].evidence}` : ''}`;
    });
    return [`### ${item.id} · \`${item.answer.id}\``, '', `**User prompt:** ${promptFor(cases.get(item.answer.id), cases)}`, '',
      `**Criterion ${item.index + 1}:** ${item.criterion}`, '', '<details><summary>Answer</summary>', '', '````text', item.answer.text, '````', '',
      '</details>', '', ...readers, '', 'Label: ', ''].join('\n');
  });
  writeFileSync(sheetPath, [`# Split verdicts: ${splits.length} of ${items.length} criteria`, '',
    'For each item, read the answer and write `Label: P` if it meets the criterion or `Label: F` if it does not. ' +
    'Readers are the candidate judges, in a different order for each item.', '', ...sections].join('\n'));
  writeFileSync(join(options.out, 'split-key.json'), `${JSON.stringify(Object.fromEntries(splits.map((item) => [item.id, item.key])), null, 2)}\n`);
  console.log(`${splits.length} of ${items.length} criteria split. Sheet: ${sheetPath}`);
}

// Per judge: agreement with the maintainer's labels on split items, agreement
// with the other judges on criteria where they all reach the same verdict, how
// often all its votes agree, errors, and cost. Comparing a judge with a
// consensus that includes it would always agree, so the comparison leaves it out.
export function scoreJudges(items, votes, labels) {
  const rows = {};
  for (const judge of Object.keys(votes).sort()) {
    const row = { labeled: 0, agreeLabels: 0, othersAgree: 0, matchesOthers: 0, multiVote: 0, unanimous: 0, calls: 0, errors: 0, safetyErrors: 0, costUsd: 0 };
    for (const list of Object.values(votes[judge])) {
      for (const vote of list) {
        row.calls += 1;
        if (vote.error) {
          row.errors += 1;
          if (SAFETY.test(vote.error)) row.safetyErrors += 1;
        } else row.costUsd += vote.costUsd ?? 0;
      }
    }
    for (const item of items) {
      const verdict = item.verdicts[judge];
      const valid = (votes[judge][answerKey(item.answer)] ?? []).filter((vote) => !vote.error);
      if (valid.length > 1) {
        row.multiVote += 1;
        if (new Set(valid.map((vote) => vote.checks[item.index].pass)).size === 1) row.unanimous += 1;
      }
      if (item.split && item.id in labels) {
        row.labeled += 1;
        if (verdict === labels[item.id]) row.agreeLabels += 1;
      }
      const others = Object.entries(item.verdicts).filter(([other]) => other !== judge).map(([, value]) => value);
      if (others.length && !others.includes(null) && new Set(others).size === 1) {
        row.othersAgree += 1;
        if (verdict === others[0]) row.matchesOthers += 1;
      }
    }
    rows[judge] = row;
  }
  return rows;
}

function writeReport(options) {
  const answers = JSON.parse(readFileSync(join(options.out, 'answers.json'), 'utf8'));
  const votes = readVotes(options.out);
  const { items } = triage(answers, votes);
  const sheetPath = join(options.out, 'split.md');
  const labels = existsSync(sheetPath) ? parseLabels(readFileSync(sheetPath, 'utf8')) : {};
  const splits = items.filter((item) => item.split).length;
  const rows = scoreJudges(items, votes, labels);
  const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : 'n/a');
  const table = ['| Judge | Matches labels | Matches the other judges | All votes agree | Errors (safety) | Cost (USD) |', '|---|---|---|---|---|---|',
    ...Object.entries(rows).map(([judge, row]) => `| \`${judge}\` | ${pct(row.agreeLabels, row.labeled)} | ${pct(row.matchesOthers, row.othersAgree)} | ` +
      `${pct(row.unanimous, row.multiVote)} | ${row.errors}/${row.calls} (${row.safetyErrors}) | ${row.costUsd ? row.costUsd.toFixed(2) : 'not reported'} |`)];
  const report = [`# Judge comparison`, '', `${items.length} criteria; ${splits} split; ${Object.keys(labels).length} labeled.`, '', ...table, '',
    '"Matches the other judges" counts the criteria where every other judge reached the same majority verdict. ' +
    'A miss means this judge alone disagreed.', '', 'Codex calls report token usage in the vote files, not dollars.', ''].join('\n');
  writeFileSync(join(options.out, 'report.md'), report);
  console.log(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'judge') await judgeAll(options);
    else if (options.command === 'triage') writeSheet(options);
    else writeReport(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
