import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeRuns, runsFromClaude, runsFromCodex, score, scoreCase } from './gate.mjs';

const runs = (...passed) => passed.map((p) => ({ passed: p, error: null }));

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
