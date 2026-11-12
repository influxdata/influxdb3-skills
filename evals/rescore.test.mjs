import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadAnswers, majority, parseArgs, parseLabels, readVotes, scoreJudges, triage } from './rescore.mjs';

const vote = (...passes) => ({ pass: passes.every(Boolean), checks: passes.map((pass, i) => ({ id: i + 1, pass, evidence: `e${i + 1}` })) });

test('parseArgs requires a harness, model, and effort for every judge', () => {
  const options = parseArgs(['judge', '--out', 'o', '--answers', 'opus=r.json', '--answers', 'evals/results/codex-x',
    '--judge', 'claude:claude-opus-5-5:high', '--judge', 'codex:gpt-6-astra:low', '--case', 'a,b']);
  assert.deepEqual(options.answers, [{ label: 'opus', path: 'r.json' }, { label: 'codex-x', path: 'evals/results/codex-x' }]);
  assert.deepEqual(options.judges.map((judge) => judge.slug), ['claude_claude-opus-5-5_high', 'codex_gpt-6-astra_low']);
  assert.deepEqual(options.caseIds, ['a', 'b']);
  assert.throws(() => parseArgs(['judge', '--out', 'o', '--answers', 'r.json', '--judge', 'claude:claude-opus-5-5']), /harness:model:effort/);
  assert.throws(() => parseArgs(['judge', '--out', 'o', '--answers', 'r.json']), /needs --answers and --judge/);
  assert.throws(() => parseArgs(['triage']), /--out is required/);
});

test('loadAnswers reads Claude Code result files and Codex result directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rescore-test-'));
  const claude = join(dir, 'claude.json');
  writeFileSync(claude, JSON.stringify({ cases: [{ name: 'a', arms: { with: [
    { graders: [{ name: 'criteria', evidence: 'answer one' }] },
    { graders: [{ name: 'regex' }] },
    { graders: [{ name: 'criteria', evidence: 'answer three' }] },
  ] } }] }));
  assert.deepEqual(loadAnswers('opus', claude), [
    { source: 'opus', id: 'a', run: 1, text: 'answer one' },
    { source: 'opus', id: 'a', run: 3, text: 'answer three' },
  ]);
  const codex = join(dir, 'codex');
  mkdirSync(codex);
  writeFileSync(join(codex, 'summary.json'), JSON.stringify({ results: [{ id: 'a', run: 1 }, { id: 'a', run: 2 }] }));
  writeFileSync(join(codex, 'a.run-1.answer.txt'), 'codex answer');
  assert.deepEqual(loadAnswers('sol', codex), [{ source: 'sol', id: 'a', run: 1, text: 'codex answer' }]);
});

test('majority needs more than half of the valid votes', () => {
  assert.equal(majority([vote(true), vote(true), vote(false)], 0), true);
  assert.equal(majority([vote(false), { error: 'x' }, vote(false)], 0), false);
  assert.equal(majority([vote(true), vote(false), { error: 'x' }], 0), null);
  assert.equal(majority([{ error: 'x' }], 0), null);
});

test('triage splits a criterion when judges disagree or one has no majority', () => {
  const answers = [{ source: 's', id: 'a', run: 1, text: 't', criteria: ['c1', 'c2'] }];
  const votes = {
    j1: { 's/a.run-1': [vote(true, true), vote(true, false), vote(true, false)] },
    j2: { 's/a.run-1': [vote(true, true), vote(true, true), vote(true, false)] },
  };
  const { judges, items } = triage(answers, votes);
  assert.deepEqual(judges, ['j1', 'j2']);
  assert.equal(items[0].split, false);
  assert.equal(items[1].split, true);
  assert.deepEqual(items[1].verdicts, { j1: false, j2: true });
  assert.match(items[1].id, /^S-[0-9a-f]{8}$/);
  assert.equal(triage(answers, votes).items[1].id, items[1].id);
  const tie = triage(answers, { j1: { 's/a.run-1': [vote(true, true), vote(false, true)] } });
  assert.equal(tie.items[0].split, true);
});

test('readVotes groups vote files and error files by answer', () => {
  const out = mkdtempSync(join(tmpdir(), 'rescore-votes-'));
  mkdirSync(join(out, 'votes', 'j1', 's'), { recursive: true });
  writeFileSync(join(out, 'votes', 'j1', 's', 'a.run-1.vote-1.json'), JSON.stringify(vote(true)));
  writeFileSync(join(out, 'votes', 'j1', 's', 'a.run-1.vote-2.error.txt'), 'safeguards flagged this session');
  const votes = readVotes(out);
  assert.equal(votes.j1['s/a.run-1'].length, 2);
  assert.deepEqual(votes.j1['s/a.run-1'].filter((entry) => entry.error).map((entry) => entry.error), ['safeguards flagged this session']);
});

test('parseLabels and scoreJudges measure agreement, consistency, errors, and cost', () => {
  const answers = [{ source: 's', id: 'a', run: 1, text: 't', criteria: ['c1', 'c2'] }];
  const votes = {
    j1: { 's/a.run-1': [{ ...vote(true, true), costUsd: 0.5 }, vote(true, false), vote(true, false)] },
    j2: { 's/a.run-1': [vote(true, true), vote(true, true), { error: 'Opus safeguards flagged this session' }] },
  };
  const { items } = triage(answers, votes);
  const labels = parseLabels(`### ${items[1].id} · \`a\`\n\nLabel: p\n\n### S-00000000 · \`b\`\n\nLabel: \n`);
  assert.deepEqual(labels, { [items[1].id]: true });
  const rows = scoreJudges(items, votes, labels);
  assert.deepEqual(rows.j1, { labeled: 1, agreeLabels: 0, othersAgree: 2, matchesOthers: 1, multiVote: 2, unanimous: 1,
    calls: 3, errors: 0, safetyErrors: 0, costUsd: 0.5 });
  assert.deepEqual(rows.j2, { labeled: 1, agreeLabels: 1, othersAgree: 2, matchesOthers: 1, multiVote: 2, unanimous: 2,
    calls: 3, errors: 1, safetyErrors: 1, costUsd: 0 });
});

test('scoreJudges compares each judge with the other judges only where they all agree', () => {
  const answers = [{ source: 's', id: 'a', run: 1, text: 't', criteria: ['c1', 'c2'] }];
  const votes = {
    j1: { 's/a.run-1': [vote(true, false)] },
    j2: { 's/a.run-1': [vote(true, true)] },
    j3: { 's/a.run-1': [vote(true, false)] },
  };
  const rows = scoreJudges(triage(answers, votes).items, votes, {});
  assert.deepEqual([rows.j1.othersAgree, rows.j1.matchesOthers], [1, 1]);
  assert.deepEqual([rows.j2.othersAgree, rows.j2.matchesOthers], [2, 1]);
});
