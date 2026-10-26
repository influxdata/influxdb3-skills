import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { uncitedLiveVerified } from './changelog-claims.mjs';

const command = resolve('evals/check-release.mjs');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const write = (path, value) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), value);
  };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); };
  const run = (...args) => spawnSync(process.execPath, [command, ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  write('skills/influxdb3/SKILL.md', '---\nmetadata:\n  docs_checked_against: "influxdb3-core 3.12.1, influxdb3-enterprise 3.12.1"\n---\nOriginal guidance\n');
  write('plugin.json', '{"version":"0.7.2"}');
  write('CHANGELOG.md', '# Changelog\n\n## [0.7.3] — Unreleased\n\n### Live-verified behavior corrections\n\n- Fixture correction. Claim claim-20261015-0107.\n');
  write('evals/prompts.jsonl', ['adversarial', 'negative', 'connect', 'plugins'].map((category) => JSON.stringify({ id: category, category, prompt: 'Original' })).join('\n'));
  commit();
  return { dir, git, write, commit, run, base: git('rev-parse', 'HEAD') };
}

test('unlabeled skill and prompt changes trigger full verification; process docs do not', (t) => {
  const f = fixture(t);
  f.write('docs/publishing.md', 'Process correction\n');
  f.commit();
  const unchanged = f.run('plan', '--base', f.base);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.equal(JSON.parse(unchanged.stdout).run, false);
  f.write('skills/influxdb3/SKILL.md', 'metadata:\n  docs_checked_against: "influxdb3-core 3.12.1, influxdb3-enterprise 3.12.1"\nChanged guidance\n');
  f.commit();
  const changed = f.run('plan', '--base', f.base);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(JSON.parse(changed.stdout).run, true);
  assert.equal(JSON.parse(f.run('plan', '--base', f.base, '--release').stdout).run, true);
  const noBump = f.run('verify', '--base', f.base);
  assert.equal(noBump.status, 1);
  assert.match(noBump.stderr, /new shared package version/);
});

test('release verification checks version, exact evidence hashes, required cases, and both agents', (t) => {
  const f = fixture(t);
  f.write('plugin.json', '{"version":"0.7.3"}');
  f.commit();
  const prompts = ['adversarial', 'negative', 'connect', 'plugins'].map((category) => ({ id: category, category }));
  const claude = { cases: prompts.map(({ id }) => ({ name: id, arms: { with: [true, true, true].map((passed) => ({ passed })) } })) };
  const codex = { results: prompts.flatMap(({ id }) => [1, 2, 3].map((run) => ({ id, run, pass: true }))) };
  const manifest = { release: 'v0.7.3', skills_tree: f.git('rev-parse', 'HEAD:skills'), prompts_blob: f.git('rev-parse', 'HEAD:evals/prompts.jsonl'),
    required_cases: ['plugins'],
  };
  for (const agent of ['claude', 'codex']) {
    manifest[agent] = [{ file: `${agent}.json`, skills_tree: manifest.skills_tree, prompts_blob: manifest.prompts_blob, runs: 3,
      model: 'fixed-answer-model', judge: 'fixed-judge', cli_version: '1.0' }];
  }
  const save = () => {
    for (const c of claude.cases) c.arms.with.forEach((r, i) => {
      r.startedAt ??= new Date(1700000000000 + i * 1000).toISOString();
      r.tracePath ??= `/tmp/${c.name}/session-${i}/trace.jsonl`;
    });
    f.write('evals/evidence/v0.7.3/manifest.json', JSON.stringify(manifest));
    f.write('evals/evidence/v0.7.3/claude.json', JSON.stringify(claude));
    f.write('evals/evidence/v0.7.3/codex.json', JSON.stringify(codex));
    f.commit();
    return f.run('verify', '--base', f.base);
  };
  const good = save();
  assert.equal(good.status, 0, good.stderr);
  manifest.skills_tree = '0'.repeat(40);
  const mismatch = save();
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /skills_tree/);
  manifest.skills_tree = f.git('rev-parse', 'HEAD:skills');
  manifest.required_cases = ['does-not-exist'];
  assert.match(save().stderr, /unknown required case/);
  manifest.required_cases = ['plugins'];
  codex.results.pop();
  const incomplete = save();
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stdout, /Incomplete evidence/);
  codex.results.push({ id: 'plugins', run: 3, pass: true });
  claude.cases.at(-1).arms.with = [{ passed: true }, { passed: false }, { passed: false }];
  assert.equal(save().status, 1, 'required plugin failure must block');
  claude.cases.at(-1).arms.with = [{ passed: true }, { passed: true }, { passed: true }];
  f.write('evals/prompts.jsonl', prompts.map((p) => JSON.stringify({ ...p, prompt: 'Updated' })).join('\n'));
  f.commit();
  manifest.prompts_blob = f.git('rev-parse', 'HEAD:evals/prompts.jsonl');
  for (const agent of ['claude', 'codex']) manifest[agent][0].prompts_blob = manifest.prompts_blob;
  const omitted = save();
  assert.equal(omitted.status, 1);
  assert.match(omitted.stderr, /changed prompt must be required/);
  manifest.required_cases = prompts.map((p) => p.id);
  assert.equal(save().status, 0);
  const released = f.git('rev-parse', 'HEAD');
  manifest.required_cases = ['plugins', 'admin'];
  save();
  const rewritten = f.run('verify', '--base', released);
  assert.equal(rewritten.status, 1);
  assert.match(rewritten.stderr, /immutable/);
});

test('a prompt-only change triggers verification and must be individually required', (t) => {
  const f = fixture(t);
  f.write('evals/prompts.jsonl', ['adversarial', 'negative', 'connect', 'plugins'].map((category) =>
    JSON.stringify({ id: category, category, prompt: category === 'plugins' ? 'Changed' : 'Original' })).join('\n'));
  f.commit();
  const plan = f.run('plan', '--base', f.base);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).run, true);
  assert.equal(f.run('plan', '--base', 'missing-ref').status, 1, 'invalid diff bases fail closed');
});

test('moving a skill reference out of skills still triggers verification', (t) => {
  const f = fixture(t);
  f.write('skills/influxdb3/references/example.md', 'Guidance\n');
  f.commit();
  const base = f.git('rev-parse', 'HEAD');
  mkdirSync(join(f.dir, 'docs'));
  renameSync(join(f.dir, 'skills/influxdb3/references/example.md'), join(f.dir, 'docs/example.md'));
  f.commit();
  assert.equal(JSON.parse(f.run('plan', '--base', base).stdout).run, true);
});

test('an evidence-only PR cannot rewrite any released version', (t) => {
  const f = fixture(t);
  f.write('evals/evidence/v0.7.0/claude.json', '{"original":true}');
  f.commit();
  const base = f.git('rev-parse', 'HEAD');
  f.write('evals/evidence/v0.7.0/claude.json', '{"edited":true}');
  f.commit();
  const r = f.run('plan', '--base', base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /immutable/);
});

test('release verification rejects Live-verified changelog lines without a claim ID', (t) => {
  const f = fixture(t);
  f.write('plugin.json', '{"version":"0.7.3"}');
  f.write('CHANGELOG.md', '## [0.7.3] — Unreleased\n\n### Live-verified behavior corrections\n\n- Cited. claim-20261015-0107\n- Uncited correction.\n');
  f.commit();
  const r = f.run('verify', '--base', f.base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must cite a claim ID/);
  assert.match(r.stderr, /Uncited correction/);
  assert.doesNotMatch(r.stderr, /Cited\. claim/);
});

test('changelog claim check reads only the release section\'s Live-verified bullets, including wrapped lines', () => {
  const log = [
    '## [0.7.3] — Unreleased', '', '### Fixed', '- No claim needed here.', '',
    '### Live-verified behavior corrections', '- Wrapped line starts here', '  and cites claim-20261023-0001.', '- Bare.', '',
    '## [0.7.2] — 2026-09-29', '', '### Live-verified', '- Older uncited line.', '',
  ].join('\n');
  assert.deepEqual(uncitedLiveVerified(log, '0.7.3'), ['- Bare.']);
  assert.throws(() => uncitedLiveVerified(log, '0.9.9'), /no section for 0\.9\.9/);
});
