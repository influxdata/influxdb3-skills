#!/usr/bin/env node
// Validate the committed measurement inputs before invoking the existing scorer.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrompts, mergeRuns, runsFromClaude, runsFromCodex } from './gate.mjs';

const nonempty = (x) => typeof x === 'string' && x.trim().length > 0;
export function validateEvidence(manifest, { version, skills, prompts, cases, read }) {
  const require = (ok, message) => { if (!ok) throw new Error(message); };
  require(/^\d+\.\d+\.\d+$/.test(manifest.core_version ?? ''), 'core_version must name an exact Core CI target');
  require(manifest.release === `v${version}`, 'release does not match package version');
  for (const [key, expected] of [['skills_tree', skills], ['prompts_blob', prompts]]) {
    require(manifest[key] === expected, `${key} must match the full current Git object ID`);
  }
  require(Array.isArray(manifest.required_cases), 'required_cases must explicitly select changed-behavior cases');
  require(new Set(manifest.required_cases).size === manifest.required_cases.length, 'duplicate required case');
  require(manifest.required_cases.every((id) => cases.some((c) => c.id === id)), 'unknown required case');
  require(manifest.required_cases.length > 0 || nonempty(manifest.no_changed_behavior), 'empty selection needs a reviewed no_changed_behavior explanation');
  require(nonempty(manifest.review_record), 'missing review_record for live contracts, release notes, and Codex findings');
  require(nonempty(read(manifest.review_record)), 'empty review_record');
  const args = [];
  for (const agent of ['claude', 'codex']) {
    require(Array.isArray(manifest[agent]) && manifest[agent].length > 0, `missing ${agent} evidence`);
    const maps = [];
    let models;
    for (const entry of manifest[agent]) {
      require(entry.skills_tree === skills && entry.prompts_blob === prompts, `${agent} entry has stale content identity`);
      require(entry.runs === 3 && nonempty(entry.model) && nonempty(entry.judge), `${agent} entry needs three runs and named answer/judge models`);
      const identity = JSON.stringify([entry.model, entry.judge]);
      require(!models || models === identity, `${agent} models changed during measurement`);
      models = identity;
      const result = JSON.parse(read(entry.file));
      if (agent === 'codex') {
        require(result.model === entry.model && result.judgeModel === entry.judge, 'Codex result models disagree with the manifest');
      }
      const runs = agent === 'claude' ? runsFromClaude(result) : runsFromCodex(result);
      require(runs.size > 0 && [...runs].every(([id, rs]) => cases.some((c) => c.id === id) && rs.length === 3), `${agent} file has unknown cases or inadequate runs`);
      maps.push(runs);
      args.push(`--${agent}`, entry.file);
    }
    // Both agents must measure the whole suite, even where aggregate scoring permits misses.
    require(cases.every((c) => mergeRuns(maps).get(c.id)?.length === 3), `${agent} evidence does not cover the full suite`);
  }
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const version = JSON.parse(readFileSync('plugin.json', 'utf8')).version;
    const dir = resolve(`evals/evidence/v${version}`);
    const manifestPath = resolve(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Evidence for a version is immutable once it reaches main.
    if (process.env.BASE_SHA) {
      const base = process.env.BASE_SHA;
      const changedEvidence = git('diff', '--name-only', base, 'HEAD', '--', 'evals/evidence').split('\n').filter(Boolean);
      for (const path of changedEvidence) {
        const directory = path.split('/').slice(0, 3).join('/');
        if (spawnSync('git', ['cat-file', '-e', `${base}:${directory}`]).status === 0) {
          throw new Error(`existing evidence directory is immutable: ${directory}`);
        }
      }
      const before = JSON.parse(git('show', `${base}:plugin.json`)).version;
      if (before === version || spawnSync('git', ['cat-file', '-e', `${base}:evals/evidence/v${version}/manifest.json`]).status === 0) {
        throw new Error('skill-changing merge requires a new package version and evidence directory');
      }
    }
    const read = (file) => {
      if (!nonempty(file) || relative(dir, resolve(dir, file)).startsWith('..')) throw new Error('evidence paths must stay in the version directory');
      return readFileSync(resolve(dir, file), 'utf8');
    };
    const args = validateEvidence(manifest, {
      version, skills: git('rev-parse', 'HEAD:skills'), prompts: git('rev-parse', 'HEAD:evals/prompts.jsonl'),
      cases: readPrompts(readFileSync('evals/prompts.jsonl', 'utf8')), read,
    });
    const paths = args.map((arg) => arg.startsWith('--') ? arg : resolve(dir, arg));
    const result = spawnSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), 'gate.mjs'), ...paths,
      '--required-cases', manifestPath, '--require-three-runs'], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
