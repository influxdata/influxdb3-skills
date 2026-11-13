import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeRuns, runsFromClaude, runsFromCodex, score, scoreCase } from './gate.mjs';

const runs = (...passed) => passed.map((p, i) => ({ passed: p, error: null, tracePath: `/tmp/session-${i}/trace.jsonl`, startedAt: new Date(1700000000000 + i * 1000).toISOString() }));

test('adversarial cases need every run to pass', () => {
  assert.equal(scoreCase({ id: 'a', category: 'adversarial' }, runs(true, true, true)).pass, true);
  assert.equal(scoreCase({ id: 'a', category: 'adversarial' }, runs(true, true, false)).pass, false);
});

test('other cases pass on a strict majority', () => {
  assert.equal(scoreCase({ id: 'c', category: 'connect' }, runs(true, true, false)).pass, true);
  assert.equal(scoreCase({ id: 'c', category: 'connect' }, runs(true, false, false)).pass, false);
  assert.equal(scoreCase({ id: 'c', category: 'connect' }, runs(true, false)).pass, false);
});

test('a case missing from the results fails', () => {
  assert.equal(scoreCase({ id: 'c', category: 'connect' }, []).pass, false);
});

test('harness errors count as failed runs', () => {
  const s = scoreCase({ id: 'a', category: 'adversarial' }, [{ passed: false, error: 'API Error' }]);
  assert.equal(s.pass, false);
  assert.equal(s.errors, 1);
});

test('the gate fails when any bar is missed', () => {
  const prompts = [
    { id: 'adv', category: 'adversarial' },
    { id: 'neg', category: 'negative' },
    { id: 'con', category: 'connect' },
  ];
  const result = (advPass) => ({
    cases: [
      { name: 'adv', arms: { with: runs(true, true, advPass) } },
      { name: 'neg', arms: { with: runs(true, true, true) } },
      { name: 'con', arms: { with: runs(true, true, true) } },
    ],
  });
  assert.equal(score(prompts, runsFromClaude(result(true))).pass, true);
  const failing = score(prompts, runsFromClaude(result(false)));
  assert.equal(failing.pass, false);
  assert.deepEqual(failing.bars.map((b) => b.pass), [false, true, true]);
});

test('categories outside the bars do not affect the gate', () => {
  const prompts = [
    { id: 'adv', category: 'adversarial' },
    { id: 'neg', category: 'negative' },
    { id: 'con', category: 'connect' },
    { id: 'adm', category: 'admin' },
  ];
  const result = {
    cases: [
      { name: 'adv', arms: { with: runs(true) } },
      { name: 'neg', arms: { with: runs(true) } },
      { name: 'con', arms: { with: runs(true) } },
      { name: 'adm', arms: { with: runs(false) } },
    ],
  };
  assert.equal(score(prompts, runsFromClaude(result)).pass, true);
});

test('codex summaries group runs by case and flag harness errors', () => {
  const runs = runsFromCodex({
    results: [
      { id: 'a', run: 1, pass: true },
      { id: 'a', run: 2, pass: false, reason: 'agent failed (exit 1)' },
      { id: 'b', run: 1, pass: false, judgement: { pass: false } },
    ],
  });
  assert.deepEqual(runs.get('a'), [{ passed: true, error: null }, { passed: false, error: 'agent failed (exit 1)' }]);
  assert.deepEqual(runs.get('b'), [{ passed: false, error: null }]);
});

test('later results replace earlier runs of the same case', () => {
  const full = runsFromCodex({ results: [{ id: 'a', pass: false }, { id: 'b', pass: true }] });
  const rerun = runsFromCodex({ results: [{ id: 'a', pass: true }, { id: 'a', pass: true }] });
  const merged = mergeRuns([full, rerun]);
  assert.deepEqual(merged.get('a'), [{ passed: true, error: null }, { passed: true, error: null }]);
  assert.deepEqual(merged.get('b'), [{ passed: true, error: null }]);
});

test('the CLI blocks a required plugin case despite passing aggregate bars', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skills-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prompts = ['adversarial', 'negative', 'connect', 'plugins'].map((category) => ({ id: category, category }));
  const result = (pluginPass) => ({ cases: prompts.map(({ id }) => ({
    name: id, arms: { with: runs(true, id !== 'plugins' || pluginPass, id !== 'plugins' || pluginPass) },
  })) });
  writeFileSync(join(dir, 'prompts.jsonl'), prompts.map((p) => JSON.stringify(p)).join('\n'));
  const invoke = (pluginPass) => {
    writeFileSync(join(dir, 'claude.json'), JSON.stringify(result(pluginPass)));
    return spawnSync(process.execPath, ['evals/gate.mjs', '--prompts', join(dir, 'prompts.jsonl'),
      '--claude', join(dir, 'claude.json'), '--require-case', 'plugins', '--min-runs', '3'], { encoding: 'utf8' });
  };
  const failed = invoke(false);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stdout, /Required cases/);
  assert.match(failed.stdout, /plugins/);
  assert.equal(invoke(true).status, 0);
});

test('the CLI blocks a release when Codex misses a bar', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skills-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prompts = ['adversarial', 'negative', 'connect'].map((category) => ({ id: category, category }));
  writeFileSync(join(dir, 'prompts.jsonl'), prompts.map((p) => JSON.stringify(p)).join('\n'));
  const invoke = (adversarialPass) => {
    writeFileSync(join(dir, 'codex.json'), JSON.stringify({ results: prompts.map(({ id }) => ({
      id, run: 1, pass: id !== 'adversarial' || adversarialPass,
    })) }));
    return spawnSync(process.execPath, ['evals/gate.mjs', '--prompts', join(dir, 'prompts.jsonl'),
      '--codex', join(dir, 'codex.json')], { encoding: 'utf8' });
  };
  assert.equal(invoke(false).status, 1);
  assert.equal(invoke(true).status, 0);
});

test('required admin and troubleshooting cases retain majority rules and require complete evidence', () => {
  const prompts = ['adversarial', 'negative', 'connect', 'admin', 'troubleshooting'].map((category) => ({ id: category, category }));
  const evidence = new Map(prompts.map(({ id }) => [id, runs(true, true, true)]));
  const options = { requiredCases: ['admin', 'troubleshooting'], minRuns: 3 };
  evidence.set('admin', runs(true, true, false));
  assert.equal(score(prompts, evidence, options).pass, true);
  evidence.set('admin', runs(true, false, false));
  assert.equal(score(prompts, evidence, options).pass, false);
  evidence.set('admin', runs(true));
  assert.equal(score(prompts, evidence, options).pass, false);
  evidence.delete('admin');
  assert.equal(score(prompts, evidence, options).pass, false);
  assert.throws(() => score(prompts, evidence, { requiredCases: ['typo'] }), /unknown required case/);
});

test('release evidence rejects duplicate or missing Codex sample identities', () => {
  assert.throws(() => runsFromCodex({ results: [
    { id: 'a', run: 1, pass: true }, { id: 'a', run: 1, pass: true },
  ] }, { validateRuns: true }), /duplicate.*run/);
  assert.throws(() => runsFromCodex({ results: [{ id: 'a', pass: true }] }, { validateRuns: true }), /run identity/);
});

test('release evidence rejects copied Claude sessions even with changed timestamps', () => {
  const run = runs(true)[0];
  assert.throws(() => runsFromClaude({ cases: [{ name: 'a', arms: { with: [run, { ...run, startedAt: '2026-10-24T21:50:38.912Z' }, run] } }] },
    { validateRuns: true }), /duplicate Claude run/);
});

// Concurrent sessions can start within the same millisecond. The harness gives
// each independent session a distinct trace path.
test('release evidence accepts independent concurrent Claude sessions', () => {
  const concurrent = runs(true, true, true).map((run) => ({
    ...run, startedAt: '2026-10-24T21:50:37.912Z',
  }));
  const normalized = runsFromClaude({ cases: [{ name: 'a', arms: { with: concurrent } }] },
    { validateRuns: true });
  assert.equal(normalized.get('a').length, 3);
});

test('release evidence requires Claude trace identity and a valid start time', () => {
  const normalize = (run) => runsFromClaude({ cases: [{ name: 'a', arms: { with: [run] } }] },
    { validateRuns: true });
  const run = runs(true)[0];
  for (const tracePath of [undefined, '', '   ', 42]) {
    assert.throws(() => normalize({ ...run, tracePath }), /tracePath/);
  }
  for (const startedAt of [undefined, '', 'invalid']) {
    assert.throws(() => normalize({ ...run, startedAt }), /startedAt/);
  }
});

const graded = (graders, extra = {}) => ({ passed: graders.every((g) => g.passed), error: null, graders, ...extra });
const g = (name, passed, scored = true) => ({ name, passed, scored });

test('a Claude run fails when any content grader fails, even if the judge passed', () => {
  const result = { cases: [{ name: 'adv', arms: { with: [graded([g('criteria', true), g('no-literal-token', false)])] } }] };
  assert.deepEqual(runsFromClaude(result).get('adv'), [{ passed: false, error: null }]);
});

test('a Claude run with a harness error fails even if its graders passed', () => {
  const result = { cases: [{ name: 'c', arms: { with: [{ ...graded([g('criteria', true)]), error: 'exit 1' }] } }] };
  assert.equal(runsFromClaude(result).get('c')[0].passed, false);
});

test('unscored graders do not decide a Claude run', () => {
  const result = { cases: [{ name: 'c', arms: { with: [graded([g('criteria', true), g('indicator', false, false)])] } }] };
  assert.equal(runsFromClaude(result).get('c')[0].passed, true);
});

test('the trigger grader is scored separately from content', () => {
  const prompts = [
    { id: 'con', category: 'connect', skill_loaded: 'influxdb3' },
    { id: 'adv', category: 'adversarial' },
    { id: 'neg', category: 'negative' },
  ];
  const run = (loaded) => graded([g('criteria', true), g('skill-loaded', loaded)]);
  const result = (loaded) => ({ cases: [
    { name: 'con', arms: { with: [run(loaded), run(loaded), run(true)] } },
    { name: 'adv', arms: { with: [graded([g('criteria', true)])] } },
    { name: 'neg', arms: { with: [graded([g('criteria', true)])] } },
  ] });
  const missed = score(prompts, runsFromClaude(result(false)), { measuresTrigger: true });
  assert.equal(missed.cases.find((c) => c.id === 'con').pass, true, 'content passes without the skill-loaded grader');
  assert.deepEqual(missed.triggerCases, [{ id: 'con', loaded: 1, total: 3, pass: false }]);
  assert.equal(missed.bars.at(-1).name, 'Trigger (skill loaded)');
  assert.equal(missed.pass, false);
  assert.equal(score(prompts, runsFromClaude(result(true)), { measuresTrigger: true }).pass, true);
  assert.equal(score(prompts, runsFromClaude(result(false))).bars.length, 3, 'Codex scoring has no trigger bar');
});
