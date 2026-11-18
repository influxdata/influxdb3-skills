import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const command = resolve('scripts/check-claim-policy.mjs');

function fixture(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'claim-policy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => assert.equal(spawnSync('git', args, { cwd: dir }).status, 0);
  git('init', '-q');
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), value);
  }
  git('add', '.');
  return spawnSync(process.execPath, [command], { cwd: dir, encoding: 'utf8' });
}

test('claim IDs are allowed in maintainer records and absent from runtime text', (t) => {
  const r = fixture(t, {
    'skills/a/SKILL.md': 'Core 3.12.1 returns 500 before the first row.\n',
    'CHANGELOG.md': 'Verified by claim-20261015-0107.\n',
    'docs/notes.md': 'See claim-20261015-0108.\n',
  });
  assert.equal(r.status, 0, r.stderr);
});

test('a claim ID anywhere under skills/ fails with file and line', (t) => {
  const r = fixture(t, { 'skills/a/references/x.md': 'ok\nSee claim-20261015-0107.\n' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skills\/a\/references\/x\.md:2: claim ID in runtime text/);
});

test('research paths fail in any tracked file', (t) => {
  for (const path of ['skills/a/SKILL.md', 'docs/x.md', '.github/pull_request_template.md']) {
    const r = fixture(t, { [path]: 'Ledger: research/claims/2026-10-15-run/claims.yml\n' });
    assert.equal(r.status, 1, path);
    assert.match(r.stderr, new RegExp(`${path.replace(/[.]/g, '\\.')}:1: docs-tooling research path`));
  }
});

test('the word research without a ledger path is allowed', (t) => {
  const r = fixture(t, { 'docs/x.md': 'Deep research/analysis notes.\n' });
  assert.equal(r.status, 0, r.stderr);
});
