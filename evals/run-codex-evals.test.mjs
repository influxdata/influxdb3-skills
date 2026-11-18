import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexAnswerCommand, runFinalMessageRegexChecksAndSkipOthers, harnessForJudgeModel, parseArgs } from './run-codex-evals.mjs';

test('Codex applies regex checks on the final message and skips the rest', () => {
  const testCase = {
    checks: [
      { name: 'no-literal-token', type: 'regex', pattern: 'tok_123', match: 'not_contains' },
      { name: 'reads-env', type: 'regex', pattern: 'os\\.environ', match: 'contains' },
      { name: 'one-block', type: 'regex', pattern: '```python', match: 'count:1' },
      { name: 'trace-only', type: 'regex', pattern: 'x', target: 'trace' },
      { name: 'read-writing', type: 'tool_used', tool: 'Read' },
    ],
  };
  const response = 'Use os.environ["INFLUXDB_TOKEN"].\n```python\nprint(1)\n```\n';
  assert.deepEqual(runFinalMessageRegexChecksAndSkipOthers(testCase, response), [
    { name: 'no-literal-token', pass: true },
    { name: 'reads-env', pass: true },
    { name: 'one-block', pass: true },
    { name: 'trace-only', skipped: true },
    { name: 'read-writing', skipped: true },
  ]);
  assert.equal(runFinalMessageRegexChecksAndSkipOthers(testCase, 'token tok_123')[0].pass, false);
  assert.deepEqual(runFinalMessageRegexChecksAndSkipOthers({ id: 'plain' }, 'anything'), []);
});

test('Codex runs ignore the user config and pass every scored setting explicitly', () => {
  const command = codexAnswerCommand({ prompt: 'p', answerPath: 'out.txt', model: 'm', effort: 'high', verbosity: 'medium' });
  assert.ok(command.includes('--ignore-user-config'));
  assert.deepEqual(command.slice(command.indexOf('--model'), command.indexOf('--model') + 2), ['--model', 'm']);
  assert.ok(command.includes('model_reasoning_effort="high"'));
  assert.ok(command.includes('model_verbosity="medium"'));
  assert.equal(command.at(-1), 'p');
  const noVerbosity = codexAnswerCommand({ prompt: 'p', answerPath: 'out.txt', model: 'm', effort: 'low' });
  assert.ok(!noVerbosity.some((part) => part.startsWith('model_verbosity')));
});

test('Codex runs require an answer and judge effort', () => {
  assert.throws(() => parseArgs([]), /--effort and --judge-effort are required/);
  assert.throws(() => parseArgs(['--effort', 'high']), /--effort and --judge-effort are required/);
  assert.throws(() => parseArgs(['--effort', 'loud', '--judge-effort', 'high']), /--effort must be one of/);
  const options = parseArgs(['--effort', 'medium', '--judge-effort', 'high', '--runs', '3']);
  assert.equal(options.effort, 'medium');
  assert.equal(options.judgeEffort, 'high');
  assert.equal(options.verbosity, null);
});

test('Codex runs default to the ADR-0004 judge and check judge effort for its harness', () => {
  assert.equal(parseArgs(['--effort', 'medium', '--judge-effort', 'medium']).judgeModel, 'claude-opus-5-5');
  assert.equal(harnessForJudgeModel('claude-opus-5-5'), 'claude');
  assert.equal(harnessForJudgeModel('gpt-6.1-sol'), 'codex');
  assert.equal(parseArgs(['--effort', 'medium', '--judge-effort', 'max']).judgeEffort, 'max');
  assert.throws(() => parseArgs(['--effort', 'medium', '--judge-model', 'gpt-6.1-sol', '--judge-effort', 'max']), /--judge-effort must be one of/);
});
