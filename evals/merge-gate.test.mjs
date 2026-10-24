import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { shouldRun } from './gate-trigger.mjs';
import { validateEvidence } from './verify-evidence.mjs';

const cases = ['adversarial', 'negative', 'connect', 'plugins', 'admin', 'troubleshooting'].map((category) => ({ id: category, category }));
const claude = (fail = '', count = 3) => ({ cases: cases.map((c) => ({ name: c.id, arms: { with: Array.from({ length: count }, () => ({ passed: c.id !== fail })) } })) });
const codex = { model: 'answer', judgeModel: 'judge', results: cases.flatMap((c) => [1, 2, 3].map((run) => ({ id: c.id, run, pass: true }))) };
const context = { version: '1.0.0', skills: 'a'.repeat(40), prompts: 'b'.repeat(40), cases,
  read: (file) => file === 'review.md' ? 'Reviewed live contracts and Codex findings' : JSON.stringify(file === 'claude.json' ? claude() : codex) };
const manifest = () => ({ release: 'v1.0.0', core_version: '3.12.1', skills_tree: context.skills, prompts_blob: context.prompts,
  required_cases: ['plugins', 'admin', 'troubleshooting'], review_record: 'review.md',
  ...Object.fromEntries(['claude', 'codex'].map((agent) => [agent, [{ file: `${agent}.json`, skills_tree: context.skills, prompts_blob: context.prompts, runs: 3, model: 'answer', judge: 'judge' }]])) });

test('unlabeled skill, metadata, example, deleted skill, and prompt changes trigger; process-only does not', () => {
  for (const path of ['skills/influxdb3/SKILL.md', 'skills/influxdb3/examples/x.py', 'skills/removed/file', 'evals/prompts.jsonl', 'plugin.json', 'evals/evidence/v1.0.0/manifest.json']) {
    assert.equal(shouldRun('pull_request', [path]), true);
  }
  assert.equal(shouldRun('pull_request', ['TESTING.md', 'evals/gate.mjs']), false);
  for (const event of ['push', 'workflow_dispatch']) assert.equal(shouldRun(event, []), true);
});

test('workflow always exposes final gate and runs regression tests independently', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /run: node evals\/gate-trigger.mjs/);
  assert.match(workflow, /needs: \[gate-trigger, examples\]\n    if: always\(\)/);
  assert.match(workflow, /BASE_SHA: \$\{\{ github.event.pull_request.base.sha \}\}/);
  assert.match(workflow, /run: node evals\/verify-evidence.mjs/);
});

test('matching full identities and complete measurements validate', () => {
  assert.deepEqual(validateEvidence(manifest(), context), ['--claude', 'claude.json', '--codex', 'codex.json']);
});

for (const [name, change] of [
  ['stale skills, including a version/date-only edit', (m) => { m.skills_tree = 'c'.repeat(40); }],
  ['abbreviated identity', (m) => { m.skills_tree = context.skills.slice(0, 7); }],
  ['stale prompt', (m) => { m.prompts_blob = 'c'.repeat(40); }],
  ['stale per-file identity', (m) => { m.claude[0].skills_tree = 'c'.repeat(40); }],
  ['missing selection', (m) => { delete m.required_cases; }],
  ['empty unexplained selection', (m) => { m.required_cases = []; }],
  ['unknown selection', (m) => { m.required_cases = ['unknown']; }],
  ['false Codex model metadata', (m) => { m.codex[0].model = 'other'; }],
  ['missing Codex', (m) => { m.codex = []; }],
  ['missing review', (m) => { delete m.review_record; }],
  ['wrong release', (m) => { m.release = 'v0.9.0'; }],
]) test(`evidence rejects ${name}`, () => {
  const m = manifest(); change(m);
  assert.throws(() => validateEvidence(m, context));
});

test('evidence rejects incomplete or single-run suite regardless of manifest run count', () => {
  for (const result of [claude('', 1), { cases: claude().cases.slice(1) }]) {
    assert.throws(() => validateEvidence(manifest(), { ...context, read: (f) => f === 'claude.json' ? JSON.stringify(result) : context.read(f) }));
  }
});

test('actual scorer exit blocks each selected category despite passing aggregate bars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-gate-'));
  try {
    const prompts = join(dir, 'prompts.jsonl'), results = join(dir, 'claude.json'), selection = join(dir, 'manifest.json');
    writeFileSync(prompts, cases.map((c) => JSON.stringify(c)).join('\n'));
    writeFileSync(selection, JSON.stringify(manifest()));
    const run = () => spawnSync(process.execPath, ['evals/gate.mjs', '--prompts', prompts, '--claude', results, '--required-cases', selection, '--require-three-runs'], { encoding: 'utf8' });
    writeFileSync(results, JSON.stringify(claude()));
    assert.equal(run().status, 0);
    const majority = claude();
    majority.cases.find((c) => c.name === 'plugins').arms.with[0].passed = false;
    writeFileSync(results, JSON.stringify(majority));
    assert.equal(run().status, 0); // selected non-adversarial cases still use strict majority
    majority.cases.find((c) => c.name === 'plugins').arms.with[0].error = 'harness failed';
    writeFileSync(results, JSON.stringify(majority));
    assert.equal(run().status, 1); // a harness error is inadequate selected-case evidence
    for (const category of ['plugins', 'admin', 'troubleshooting']) {
      writeFileSync(results, JSON.stringify(claude(category)));
      const result = run();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, new RegExp(`\\| ${category} \\| \\*\\*fail\\*\\*`));
    }
    writeFileSync(results, JSON.stringify(claude('', 1)));
    assert.equal(run().status, 1);
    writeFileSync(results, JSON.stringify({ cases: claude().cases.filter((c) => c.name !== 'admin') }));
    assert.equal(run().status, 1);
    writeFileSync(selection, JSON.stringify({ required_cases: ['unknown'] }));
    assert.notEqual(run().status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Real Git fixture exercises the commands used in Actions, not mocked Git IDs.
test('Actions entry points enforce exact content and new-version evidence, including metadata-only changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const put = (path, contents) => writeFileSync(join(dir, path), contents);
  const run = (script, env = {}) => spawnSync(process.execPath, [join(dir, script)], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ...env },
  });
  try {
    mkdirSync(join(dir, 'evals'), { recursive: true });
    mkdirSync(join(dir, 'skills'));
    for (const file of ['gate.mjs', 'gate-trigger.mjs', 'verify-evidence.mjs']) {
      copyFileSync(new URL(file, import.meta.url), join(dir, 'evals', file));
    }
    git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
    mkdirSync(join(dir, 'evals/evidence/v0.9.0'), { recursive: true });
    put('evals/evidence/v0.9.0/manifest.json', '{}');
    put('plugin.json', JSON.stringify({ version: '0.9.0' }));
    put('skills/SKILL.md', 'version: 0.9.0');
    put('evals/prompts.jsonl', cases.map((c) => JSON.stringify(c)).join('\n'));
    git('add', '.'); git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    put('TESTING.md', 'process-only change');
    git('add', 'TESTING.md'); git('commit', '-qm', 'process only');
    put('event.json', JSON.stringify({ pull_request: { base: { sha: base }, labels: [] } }));
    put('output', '');
    const triggerEnv = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(dir, 'event.json'), GITHUB_OUTPUT: join(dir, 'output') };
    assert.equal(run('evals/gate-trigger.mjs', triggerEnv).status, 0);
    assert.equal(readFileSync(join(dir, 'output'), 'utf8'), 'run=false\n');
    put('event.json', JSON.stringify({ pull_request: { base: { sha: base }, labels: [{ name: 'release' }] } }));
    put('output', '');
    assert.equal(run('evals/gate-trigger.mjs', triggerEnv).status, 0);
    assert.equal(readFileSync(join(dir, 'output'), 'utf8'), 'run=true\n');
    rmSync(join(dir, 'event.json')); rmSync(join(dir, 'output'));
    put('plugin.json', JSON.stringify({ version: '1.0.0' }));
    put('skills/SKILL.md', 'version: 1.0.0');
    git('add', '.'); git('commit', '-qm', 'final skill inputs');
    const m = manifest();
    m.skills_tree = git('rev-parse', 'HEAD:skills');
    m.prompts_blob = git('rev-parse', 'HEAD:evals/prompts.jsonl');
    for (const agent of ['claude', 'codex']) Object.assign(m[agent][0], { skills_tree: m.skills_tree, prompts_blob: m.prompts_blob });
    mkdirSync(join(dir, 'evals/evidence/v1.0.0'), { recursive: true });
    put('evals/evidence/v1.0.0/manifest.json', JSON.stringify(m));
    put('evals/evidence/v1.0.0/claude.json', JSON.stringify(claude()));
    put('evals/evidence/v1.0.0/codex.json', JSON.stringify(codex));
    put('evals/evidence/v1.0.0/review.md', 'Reviewed fixture');
    git('add', '.'); git('commit', '-qm', 'evidence');
    const invoke = () => run('evals/verify-evidence.mjs', { BASE_SHA: base });
    assert.equal(invoke().status, 0, invoke().stderr);
    const repeated = run('evals/verify-evidence.mjs', { BASE_SHA: git('rev-parse', 'HEAD') });
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /requires a new package version/);
    put('event.json', JSON.stringify({ pull_request: { base: { sha: base }, labels: [] } }));
    put('output', '');
    assert.equal(run('evals/gate-trigger.mjs', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(dir, 'event.json'), GITHUB_OUTPUT: join(dir, 'output') }).status, 0);
    assert.equal(readFileSync(join(dir, 'output'), 'utf8'), 'run=true\n');
    // A metadata-only edit invalidates previously matching evidence.
    put('skills/SKILL.md', 'version: 1.0.0\ndocs_checked: tomorrow');
    git('add', 'skills'); git('commit', '-qm', 'metadata only');
    assert.equal(invoke().status, 1);
    assert.match(invoke().stderr, /skills_tree must match/);
    // Restore skill input and change only the prompt criteria.
    put('skills/SKILL.md', 'version: 1.0.0');
    put('evals/prompts.jsonl', cases.map((c) => JSON.stringify({ ...c, criteria: 'changed' })).join('\n'));
    git('add', 'skills', 'evals/prompts.jsonl'); git('commit', '-qm', 'criteria change');
    assert.equal(invoke().status, 1);
    assert.match(invoke().stderr, /prompts_blob must match/);
    put('evals/prompts.jsonl', cases.map((c) => JSON.stringify(c)).join('\n'));
    put('evals/evidence/v0.9.0/manifest.json', '{"edited": true}');
    git('add', 'evals'); git('commit', '-qm', 'rewrite old evidence');
    assert.equal(invoke().status, 1);
    assert.match(invoke().stderr, /existing evidence directory is immutable/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
