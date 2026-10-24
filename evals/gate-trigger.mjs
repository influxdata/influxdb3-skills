#!/usr/bin/env node
// No path filter on the workflow: its final required check must always finish.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function shouldRun(event, paths) {
  return event !== 'pull_request' || paths.some((p) =>
    p.startsWith('skills/') || p.startsWith('evals/evidence/') || p === 'evals/prompts.jsonl' ||
    p === 'plugin.json' || p === '.claude-plugin/plugin.json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const paths = process.env.GITHUB_EVENT_NAME === 'pull_request'
    ? execFileSync('git', ['diff', '--name-only', '-z', `${event.pull_request.base.sha}...HEAD`], { encoding: 'utf8' }).split('\0')
    : [];
  // A release label can request verification, but its absence cannot bypass it.
  const run = shouldRun(process.env.GITHUB_EVENT_NAME, paths) ||
    event.pull_request?.labels?.some((l) => l.name === 'release') === true;
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}
