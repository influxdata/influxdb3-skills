#!/usr/bin/env node
// Enforce where claim IDs and ledger paths may appear in tracked files.
//
// Runtime text (skills/**) states a fact with its edition and version. It never
// carries a claim ID or a ledger path. Maintainer records (CHANGELOG, docs/,
// eval evidence, PR templates) may cite claim IDs, but no tracked file may
// name a path inside docs-tooling's research tree.
//
//   node scripts/check-claim-policy.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CLAIM_ID = /claim-\d{8}-\d{4}/;
const RESEARCH_PATH = /\bresearch\/(?:claims|work|reports|handoffs|playbooks)\b/;
const SELF = new Set(['scripts/check-claim-policy.mjs', 'scripts/check-claim-policy.test.mjs']);

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--deduplicate'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0').filter((p) => p && !SELF.has(p));

const failures = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('\0')) continue;
  const runtime = file.startsWith('skills/');
  text.split('\n').forEach((line, i) => {
    if (runtime && CLAIM_ID.test(line)) failures.push(`${file}:${i + 1}: claim ID in runtime text`);
    if (RESEARCH_PATH.test(line)) failures.push(`${file}:${i + 1}: docs-tooling research path`);
  });
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error('\nRuntime text states facts with edition and version, with no claim IDs. Cite IDs only in CHANGELOG, docs/, or eval evidence. Never name research/ paths.');
  process.exitCode = 1;
} else {
  console.log('Claim policy: no claim IDs in skills/** and no research paths in tracked files.');
}
