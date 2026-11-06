import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, graderFiles, readCases, scaffoldScript } from './build-claude-cases.mjs';

const base = { id: 'c', category: 'adversarial', prompt: 'p', criteria: ['one'] };

test('a case without optional fields builds only the LLM grader', () => {
  assert.deepEqual(Object.keys(graderFiles(base)), ['criteria.md']);
  assert.equal(scaffoldScript(base), null);
});

test('a regex check becomes a regex grader on the final message by default', () => {
  const files = graderFiles({ ...base, checks: [{ name: 'no-literal-token', type: 'regex', pattern: "tok_'12345", match: 'not_contains' }] });
  assert.equal(files['no-literal-token.md'], "---\ntype: regex\npattern: 'tok_''12345'\nmatch: not_contains\ntarget: last_message\nweight: 1\n---\n");
});

test('a regex check can target one written file', () => {
  const files = graderFiles({ ...base, checks: [{ name: 'env-ignored', type: 'regex', pattern: '^\\.env$', flags: 'm', target: { file: '.gitignore' } }] });
  assert.match(files['env-ignored.md'], /flags: 'm'\ntarget:\n  source: file\n  path: '\.gitignore'\n/);
});

test('a tool_used check and skill_loaded become tool_used graders', () => {
  const files = graderFiles({ ...base, skill_loaded: 'influxdb3', checks: [{ name: 'read-writing', type: 'tool_used', tool: 'Read', input_match: 'references/writing\\.md' }] });
  assert.equal(files['read-writing.md'], "---\ntype: tool_used\ntool: Read\ninput_match: 'references/writing\\.md'\nmin: 1\nweight: 1\n---\n");
  assert.match(files['skill-loaded.md'], /tool: Skill\ninput_match: '"skill"\\s\*:\\s\*"\(\?:\[\\w-\]\+:\)\?influxdb3"'/);
  const re = new RegExp('"skill"\\s*:\\s*"(?:[\\w-]+:)?influxdb3"');
  assert.ok(re.test('{"skill":"influxdb3-skills:influxdb3"}'));
  assert.ok(!re.test('{"skill":"influxdb3-skills:influxdb3-plugins"}'));
});

test('invalid checks fail the build', () => {
  assert.throws(() => graderFiles({ ...base, checks: [{ name: 'x', type: 'regex', pattern: '(' }] }));
  assert.throws(() => graderFiles({ ...base, checks: [{ name: 'x', type: 'bogus' }] }));
  assert.throws(() => graderFiles({ ...base, checks: [{ name: 'criteria', type: 'regex', pattern: 'a' }] }));
  assert.throws(() => graderFiles({ ...base, checks: [{ name: 'skill-loaded', type: 'regex', pattern: 'a' }] }));
  assert.throws(() => graderFiles({ ...base, checks: [{ name: 'x', type: 'regex', pattern: 'a', match: 'maybe' }] }));
});

test('a fixture becomes a scaffold script that writes each file', () => {
  const c = { ...base, fixture: { files: { '.env.example': 'INFLUXDB_HOST=http://localhost:8181', 'src/app.py': 'from influxdb_client_3 import InfluxDBClient3\n' } } };
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-'));
  try {
    const script = join(dir, 'scaffold.sh');
    writeFileSync(script, scaffoldScript(c));
    assert.equal(spawnSync('bash', [script], { cwd: dir }).status, 0);
    assert.equal(readFileSync(join(dir, '.env.example'), 'utf8'), 'INFLUXDB_HOST=http://localhost:8181\n');
    assert.equal(readFileSync(join(dir, 'src/app.py'), 'utf8'), 'from influxdb_client_3 import InfluxDBClient3\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.throws(() => scaffoldScript({ ...base, fixture: { files: { '../x': 'y' } } }));
  assert.throws(() => scaffoldScript({ ...base, fixture: { files: { '/etc/x': 'y' } } }));
});

test('the build writes case.yaml only for cases with a fixture', () => {
  const out = mkdtempSync(join(tmpdir(), 'cases-'));
  try {
    build([base, { ...base, id: 'f', fixture: { files: { 'a.txt': 'a' } } }], out);
    assert.ok(!existsSync(join(out, 'c', 'case.yaml')));
    assert.equal(readFileSync(join(out, 'f', 'case.yaml'), 'utf8'), 'schema_version: "1.1"\nname: f\ncontext:\n  scaffold_script: scaffold.sh\n');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('every case in prompts.jsonl builds', () => {
  const out = mkdtempSync(join(tmpdir(), 'cases-'));
  try {
    const cases = readCases(readFileSync(new URL('./prompts.jsonl', import.meta.url), 'utf8'));
    assert.equal(build(cases, out), cases.length);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

