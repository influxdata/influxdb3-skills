#!/usr/bin/env node
// Generate `claude plugin eval` cases from prompts.jsonl.
//
// prompts.jsonl is the source of truth and stays harness-neutral. This script
// writes evals/claude-cases/<id>/prompt.md and graders/criteria.md, which are
// gitignored build output. Rerun it after editing prompts.jsonl.
//
//   node evals/build-claude-cases.mjs
//   claude plugin eval ./ --case <id> --runs 1
//
// Each case runs in a fresh session, so a prompt that continues an earlier one
// names it in `follows`. Its prompt then carries the earlier request as context.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const evalsDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(evalsDir, 'claude-cases');

const cases = readFileSync(join(evalsDir, 'prompts.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`prompts.jsonl line ${i + 1}: ${err.message}`);
    }
  });
const byId = new Map(cases.map((c) => [c.id, c]));

function promptText(c) {
  if (!c.follows) return c.prompt;
  const parent = byId.get(c.follows);
  if (!parent) throw new Error(`${c.id}: follows unknown case '${c.follows}'`);
  return `Earlier in this conversation I asked: "${promptText(parent)}"\n\n${c.prompt}`;
}

rmSync(outDir, { recursive: true, force: true });
for (const c of cases) {
  if (!/^[a-z0-9-]+$/.test(c.id)) throw new Error(`unsafe case id: ${c.id}`);
  const dir = join(outDir, c.id);
  mkdirSync(join(dir, 'graders'), { recursive: true });
  writeFileSync(
    join(dir, 'prompt.md'),
    `---\nmax_turns: 10\nallowed_tools: [Read, Glob, Grep, Skill]\ntags: [${c.category}]\n---\n\n${promptText(c)}\n`
  );
  writeFileSync(
    join(dir, 'graders', 'criteria.md'),
    `---\ntype: llm\nweight: 1\n---\n\nThe response passes only if it meets every criterion:\n\n` +
      c.criteria.map((line) => `- ${line}`).join('\n') +
      '\n'
  );
}
console.log(`wrote ${cases.length} cases to ${outDir}`);
