import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deterministicChecks } from './run-codex-evals.mjs';

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
  assert.deepEqual(deterministicChecks(testCase, response), [
    { name: 'no-literal-token', pass: true },
    { name: 'reads-env', pass: true },
    { name: 'one-block', pass: true },
    { name: 'trace-only', skipped: true },
    { name: 'read-writing', skipped: true },
  ]);
  assert.equal(deterministicChecks(testCase, 'token tok_123')[0].pass, false);
  assert.deepEqual(deterministicChecks({ id: 'plain' }, 'anything'), []);
});
