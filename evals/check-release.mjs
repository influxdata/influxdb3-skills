#!/usr/bin/env node
// Plan release verification and validate the evidence consumed by the existing gate.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, appendFileSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { uncitedLiveVerified } from './changelog-claims.mjs';
import { readPrompts, mergeRuns, score, report } from './gate.mjs';
import { RUNS_FORMAT, slimRuns } from './slim-evidence.mjs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function changesSince(base) {
  if (!base) return [];
  git('rev-parse', '--verify', `${base}^{commit}`);
  return git('diff', '--no-renames', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
}

const atBase = (base, path) => git('ls-tree', '--name-only', base, '--', path) === path;
const showAtBase = (base, path) => execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// A full result file may leave released evidence only when the runs file that
// replaces it holds exactly the runs recomputed from it.
function slimmedExactly(base, full) {
  const runsPath = full.replace(/\.json$/, '.runs.json');
  if (!atBase(base, full) || existsSync(full) || atBase(base, runsPath) || !existsSync(runsPath)) return false;
  const runs = JSON.parse(readFileSync(runsPath, 'utf8'));
  const text = showAtBase(base, full);
  return isDeepStrictEqual(runs, slimRuns(runs.agent, text, { validateRuns: false }));
}

// A released manifest may change only by pointing its entries at slimmed runs files.
function manifestOnlySlimmed(base, path) {
  if (!atBase(base, path) || !existsSync(path)) return false;
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const before = JSON.parse(showAtBase(base, path));
  const after = JSON.parse(readFileSync(path, 'utf8'));
  for (const agent of ['claude', 'codex']) {
    for (const [i, entry] of (after[agent] ?? []).entries()) {
      const old = before[agent]?.[i];
      if (!old || entry.file === old.file) continue;
      const runsPath = `${dir}${entry.file}`.replace(/\/[^/]+\/\.\.\//g, '/');
      if (entry.file !== old.file.replace(/\.json$/, '.runs.json') || !existsSync(runsPath) ||
          entry.source_sha256 !== JSON.parse(readFileSync(runsPath, 'utf8')).source_sha256) return false;
      after[agent][i] = { ...entry, file: old.file };
      delete after[agent][i].source_sha256;
    }
  }
  return isDeepStrictEqual(before, after);
}

function immutableEvidence(base, changed) {
  if (!base) return;
  for (const path of changed) {
    const dir = path.match(/^evals\/evidence\/[^/]+\//)?.[0];
    if (!dir || !git('ls-tree', '-r', '--name-only', base, '--', dir)) continue;
    const allowed = path.endsWith('/manifest.json') ? manifestOnlySlimmed(base, path)
      : path.endsWith('.runs.json') ? slimmedExactly(base, path.replace(/\.runs\.json$/, '.json'))
      : slimmedExactly(base, path);
    if (!allowed) throw new Error(`released evidence is immutable: ${dir}`);
  }
}

function verify(base, changed) {
  const version = JSON.parse(readFileSync('plugin.json', 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('invalid package version');
  const dir = `evals/evidence/v${version}`;
  if (git('status', '--porcelain', '--untracked-files=all', '--', 'skills', 'evals/prompts.jsonl', 'plugin.json', dir)) {
    throw new Error('commit final skills, prompts, package version, and evidence before release verification');
  }
  if (base) {
    const oldVersion = JSON.parse(git('show', `${base}:plugin.json`)).version;
    const skillChange = changed.some((p) => p.startsWith('skills/') || p === 'evals/prompts.jsonl');
    if (skillChange && oldVersion === version) throw new Error('skill-changing merges require a new shared package version');
  }
  const uncited = uncitedLiveVerified(readFileSync('CHANGELOG.md', 'utf8'), version);
  if (uncited.length) throw new Error(`Live-verified changelog lines must cite a claim ID:\n${uncited.join('\n')}`);
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  if (manifest.release !== `v${version}`) throw new Error('manifest release does not match package version');
  for (const [key, path] of [['skills_tree', 'skills'], ['prompts_blob', 'evals/prompts.jsonl']]) {
    if (manifest[key] !== git('rev-parse', `HEAD:${path}`)) throw new Error(`manifest ${key} must match the full hash at HEAD`);
  }
  if (!Array.isArray(manifest.required_cases) || manifest.required_cases.some((id) => typeof id !== 'string') ||
      new Set(manifest.required_cases).size !== manifest.required_cases.length) {
    throw new Error('manifest required_cases must be an explicit array of unique case IDs');
  }
  if (manifest.required_cases.length === 0 && !manifest.required_cases_reason?.trim()) {
    throw new Error('an empty required_cases list needs a required_cases_reason for reviewer assessment');
  }
  if (typeof manifest.review_record !== 'string' || !git('ls-files', '--', manifest.review_record) ||
      !readFileSync(manifest.review_record, 'utf8').trim()) {
    throw new Error('manifest review_record must name a nonempty tracked review file');
  }
  const prompts = readPrompts(readFileSync('evals/prompts.jsonl', 'utf8'));
  if (base) {
    const old = new Map(readPrompts(git('show', `${base}:evals/prompts.jsonl`)).map((p) => [p.id, p]));
    for (const prompt of prompts) {
      if (!isDeepStrictEqual(old.get(prompt.id), prompt) && !manifest.required_cases.includes(prompt.id)) {
        throw new Error(`changed prompt must be required: ${prompt.id}`);
      }
    }
  }
  const sections = [];
  let passed = true;
  for (const agent of ['claude', 'codex']) {
    if (!Array.isArray(manifest[agent]) || manifest[agent].length === 0) throw new Error(`missing ${agent} full-suite evidence`);
    // Prompts, criteria, models, and effort stay frozen during measurement.
    const settings = (entry) => [entry.model, entry.judge, entry.effort, entry.judge_effort, entry.verbosity ?? null].join('\0');
    if (new Set(manifest[agent].map(settings)).size > 1) {
      throw new Error(`${agent} answer or judge model or effort changed during measurement`);
    }
    const maps = manifest[agent].map((entry) => {
      if (typeof entry.file !== 'string' || basename(entry.file) !== entry.file || !entry.file.endsWith('.runs.json')) {
        throw new Error(`invalid ${agent} evidence filename`);
      }
      const file = realpathSync(`${dir}/${entry.file}`);
      if (!file.startsWith(`${resolve(dir)}${sep}`)) throw new Error('evidence file escapes release directory');
      if (entry.skills_tree !== manifest.skills_tree || entry.prompts_blob !== manifest.prompts_blob) {
        throw new Error(`${entry.file}: evidence hashes do not match manifest`);
      }
      if (!entry.model || !entry.judge || !entry.effort || !entry.judge_effort || !entry.cli_version || entry.runs !== 3) {
        throw new Error(`${entry.file}: record model, judge, effort, judge effort, CLI version, and three runs per case`);
      }
      if (!/^[0-9a-f]{64}$/.test(entry.source_sha256 ?? '')) throw new Error(`${entry.file}: record the full result file's source_sha256`);
      const result = JSON.parse(readFileSync(file, 'utf8'));
      if (result.format !== RUNS_FORMAT || result.agent !== agent || typeof result.cases !== 'object') {
        throw new Error(`${entry.file}: not a ${agent} ${RUNS_FORMAT} file from evals/slim-evidence.mjs`);
      }
      if (result.source_sha256 !== entry.source_sha256) throw new Error(`${entry.file}: source_sha256 does not match the manifest`);
      if (agent === 'codex' && (result.model !== entry.model || result.judgeModel !== entry.judge)) {
        throw new Error(`${entry.file}: result models do not match the manifest`);
      }
      // The Codex runner records its settings; Claude Code's result file doesn't, so the manifest is the record.
      if (agent === 'codex' && (result.effort !== entry.effort || result.judgeEffort !== entry.judge_effort ||
          (result.verbosity ?? null) !== (entry.verbosity ?? null))) {
        throw new Error(`${entry.file}: result settings do not match the manifest (effort, judge effort, verbosity)`);
      }
      return new Map(Object.entries(result.cases));
    });
    const scored = score(prompts, mergeRuns(maps), { requiredCases: manifest.required_cases, minRuns: 3, measuresTrigger: agent === 'claude' });
    // Codex is advisory until it meets the bars: its results must be complete, but its bars and required cases don't block.
    passed &&= agent === 'claude' ? scored.pass : scored.incomplete.length === 0;
    sections.push(report(agent === 'claude' ? 'Claude Code' : 'Codex (advisory)', scored));
  }
  const output = `## Release verification: ${passed ? 'PASS' : 'FAIL'}\n\n${sections.join('\n\n')}\n`;
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
  if (!passed) process.exitCode = 1;
}

try {
  const [mode, ...args] = process.argv.slice(2);
  let base;
  let release = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1] && !args[i + 1].startsWith('-')) base = args[++i];
    else if (args[i] === '--release') release = true;
    else throw new Error(`unknown or incomplete argument: ${args[i]}`);
  }
  const changed = changesSince(base);
  immutableEvidence(base, changed);
  const skillChange = changed.some((p) => p.startsWith('skills/') || p === 'evals/prompts.jsonl');
  if (mode === 'verify') {
    verify(base, changed);
  } else {
    if (mode !== 'plan') throw new Error('Usage: node evals/check-release.mjs <plan|verify> [--base <ref>] [--release]');
    const run = !base || release || skillChange;
    const metadata = readFileSync('skills/influxdb3/SKILL.md', 'utf8');
    const version = metadata.match(/docs_checked_against: "influxdb3-core ([0-9]+\.[0-9]+\.[0-9]+),/i)?.[1];
    if (run && !version) throw new Error('missing exact Core version in docs_checked_against');
    console.log(JSON.stringify({ run, version, skill_change: skillChange }));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
