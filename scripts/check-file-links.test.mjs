import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const command = resolve('scripts/check-file-links.mjs');

function skillTree(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'file-links-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const run = (dir, ...args) => spawnSync(process.execPath, [command, dir, ...args], { encoding: 'utf8' });

test('linked references, code blocks, and files outside the skills pass', (t) => {
  const dir = skillTree(t, {
    'skills/a/SKILL.md': 'See [`references/x.md`](references/x.md).\n```\ncat references/x.md `references/x.md`\n```\nThe schema is `REQUIRED.md` in another repo.\n',
    'skills/a/references/x.md': 'x\n',
    'skills/b/references/y.md': 'y\n',
  });
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
});

test('an unlinked reference fails with its location', (t) => {
  const dir = skillTree(t, {
    'skills/a/SKILL.md': 'intro\nCommands: `references/x.md`.\n',
    'skills/a/references/x.md': 'x\n',
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skills\/a\/SKILL\.md:2: `references\/x\.md` is not a link/);
});

test('--fix links relative to the referencing file', (t) => {
  const dir = skillTree(t, {
    'skills/a/references/clients/p.md': 'See `references/x.md` and `../x.md`.\n',
    'skills/a/references/x.md': 'x\n',
  });
  assert.equal(run(dir, '--fix').status, 0);
  assert.equal(
    readFileSync(join(dir, 'skills/a/references/clients/p.md'), 'utf8'),
    'See [`references/x.md`](../x.md) and [`../x.md`](../x.md).\n',
  );
  assert.equal(run(dir).status, 0);
});

test('--fix resolves sibling-skill and repo paths against their skill', (t) => {
  const dir = skillTree(t, {
    'skills/a/references/t.md': 'See `b` skill → `references/t.md`, the `b` skill\'s `references/t.md`, and `skills/b/references/t.md`.\n',
    'skills/b/references/t.md': 't\n',
  });
  assert.equal(run(dir).status, 1);
  assert.equal(run(dir, '--fix').status, 0);
  assert.equal(
    readFileSync(join(dir, 'skills/a/references/t.md'), 'utf8'),
    'See `b` skill → [`references/t.md`](../../b/references/t.md), the `b` skill\'s [`references/t.md`](../../b/references/t.md), and [`skills/b/references/t.md`](../../b/references/t.md).\n',
  );
});
