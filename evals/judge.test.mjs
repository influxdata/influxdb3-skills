import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isolatedJudgeCommand, judgePrompt, verdictSchemaWithOneCheckPerCriterion } from './judge.mjs';

test('judgePrompt shows fixture files, the earlier turn, and numbered criteria', () => {
  const parent = { id: 'p', prompt: 'Connect to Core.' };
  const child = { id: 'c', follows: 'p', prompt: 'Hard-code it.', criteria: ['one', 'two'], fixture: { files: { '.env.example': 'X=1\n' } } };
  const prompt = judgePrompt(child, new Map([['p', parent], ['c', child]]), 'the answer');
  assert.match(prompt, /--- \.env\.example ---\nX=1\n/);
  assert.match(prompt, /Earlier in this conversation I asked: "Connect to Core\."\n\nHard-code it\./);
  assert.match(prompt, /Criteria:\n1\. one\n2\. two\n/);
  assert.match(prompt, /<<<\nthe answer\n>>>/);
});

test('verdictSchemaWithOneCheckPerCriterion requires exactly one check per criterion', () => {
  const schema = verdictSchemaWithOneCheckPerCriterion(3);
  assert.equal(schema.properties.checks.minItems, 3);
  assert.equal(schema.properties.checks.maxItems, 3);
  assert.equal(schema.$schema, undefined);
});

test('isolatedJudgeCommand pins model, effort, and check count, and ignores personal configuration', () => {
  const [claude, claudeArgs] = isolatedJudgeCommand({ harness: 'claude', model: 'claude-opus-5-5', effort: 'high' }, '/w', 2);
  assert.equal(claude, 'claude');
  for (const flag of ['--safe-mode', '--no-session-persistence']) assert.ok(claudeArgs.includes(flag), flag);
  assert.deepEqual(claudeArgs.slice(claudeArgs.indexOf('--tools'), claudeArgs.indexOf('--tools') + 2), ['--tools', '']);
  assert.equal(claudeArgs[claudeArgs.indexOf('--effort') + 1], 'high');
  assert.equal(JSON.parse(claudeArgs[claudeArgs.indexOf('--json-schema') + 1]).properties.checks.maxItems, 2);
  const [codex, codexArgs] = isolatedJudgeCommand({ harness: 'codex', model: 'gpt-6-astra', effort: 'low' }, '/w', 2);
  assert.equal(codex, 'codex');
  assert.ok(codexArgs.includes('--ignore-user-config'));
  assert.equal(codexArgs[codexArgs.indexOf('--cd') + 1], '/w');
  assert.equal(codexArgs[codexArgs.indexOf('--output-schema') + 1], '/w/schema.json');
  assert.ok(codexArgs.includes('model_reasoning_effort="low"'));
});
