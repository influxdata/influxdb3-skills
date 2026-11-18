import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const command = resolve('scripts/check-shared-blocks.mjs');
const block = (body) => `intro\n<!-- token-rules:start -->\n${body}\n<!-- token-rules:end -->\noutro\n`;

function check(t, main, plugins) {
  const dir = mkdtempSync(join(tmpdir(), 'shared-blocks-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of [['skills/influxdb3/SKILL.md', main], ['skills/influxdb3-plugins/SKILL.md', plugins]]) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return spawnSync(process.execPath, [command, dir], { encoding: 'utf8' });
}

test('identical copies pass', (t) => {
  const r = check(t, block('- rule'), `other text\n${block('- rule')}`);
  assert.equal(r.status, 0, r.stderr);
});

test('differing copies fail', (t) => {
  const r = check(t, block('- rule'), block('- changed rule'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /token-rules: the copies .* differ/);
});

test('a missing copy fails with the file name', (t) => {
  const r = check(t, block('- rule'), 'no block here\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skills\/influxdb3-plugins\/SKILL\.md: missing the token-rules block/);
});
