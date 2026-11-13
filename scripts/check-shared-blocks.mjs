#!/usr/bin/env node
// Keep blocks that both skills carry identical.
//
// Each skill loads on its own, so a rule both skills need lives in both
// SKILL.md files between <!-- name:start --> and <!-- name:end --> markers.
// This check fails when a copy is missing or the copies differ.
//
//   node scripts/check-shared-blocks.mjs [root]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOCKS = ['token-rules'];
const FILES = ['skills/influxdb3/SKILL.md', 'skills/influxdb3-plugins/SKILL.md'];
const root = process.argv[2] ?? '.';

function extract(text, name) {
  const start = text.indexOf(`<!-- ${name}:start -->`);
  const end = text.indexOf(`<!-- ${name}:end -->`);
  return start === -1 || end < start ? null : text.slice(start, end);
}

const failures = [];
for (const name of BLOCKS) {
  const copies = FILES.map((file) => extract(readFileSync(join(root, file), 'utf8'), name));
  copies.forEach((copy, i) => { if (copy === null) failures.push(`${FILES[i]}: missing the ${name} block`); });
  if (copies.every((copy) => copy !== null) && new Set(copies).size > 1) {
    failures.push(`${name}: the copies in ${FILES.join(' and ')} differ`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Shared blocks match: ${BLOCKS.join(', ')}.`);
}
