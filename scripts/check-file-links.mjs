#!/usr/bin/env node
// Require links for file references inside a skill.
//
// A backticked path such as `references/tokens.md` is plain text, so a renamed
// or deleted file breaks it silently. A Markdown link is checked by lychee in
// CI. This check fails when a skill file mentions a Markdown file from the same
// skill in backticks without linking it. Fenced code blocks are skipped.
// Name a file in the other skill as "`influxdb3` skill → `references/x.md`" or
// "the `influxdb3` skill's `references/x.md`"; the check resolves it against
// that skill. A repo path such as `skills/influxdb3/references/x.md` resolves
// against the repo root.
//
//   node scripts/check-file-links.mjs [root]        list unlinked references
//   node scripts/check-file-links.mjs [root] --fix  rewrite them as links
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const root = resolve(args.find((arg) => arg !== '--fix') ?? '.');
const skillsDir = join(root, 'skills');
const MENTION = /(?<!\[)`([\w./-]+\.md)`(?!\]\()/g;
const CROSS_SKILL = /`([\w-]+)` skill(?:'s)?\s*(?:→\s*)?$/;

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

// Resolve a mention against each base directory in turn.
// Return the link target relative to the file, or null outside the skill.
function linkTarget(file, skillRoot, bases, mention) {
  for (const base of bases) {
    const target = resolve(base, mention);
    if (target.startsWith(skillRoot + sep) && existsSync(target)) {
      return relative(dirname(file), target).split(sep).join('/');
    }
  }
  return null;
}

const failures = [];
const fixed = new Set();
for (const skill of readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const skillRoot = join(skillsDir, skill.name);
  for (const file of markdownFiles(skillRoot)) {
    let inFence = false;
    const lines = readFileSync(file, 'utf8').split('\n');
    const updated = lines.map((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence || /^\s*(```|~~~)/.test(line)) return line;
      return line.replace(MENTION, (match, mention, offset) => {
        const other = line.slice(0, offset).match(CROSS_SKILL)?.[1];
        let target;
        if (mention.startsWith('skills/')) target = linkTarget(file, skillsDir, [root], mention);
        else if (other) target = linkTarget(file, join(skillsDir, other), [join(skillsDir, other)], mention);
        else target = linkTarget(file, skillRoot, [dirname(file), skillRoot], mention);
        if (target === null) return match;
        failures.push(`${relative(root, file)}:${i + 1}: \`${mention}\` is not a link`);
        return `[\`${mention}\`](${target})`;
      });
    });
    if (fix && updated.join('\n') !== lines.join('\n')) {
      writeFileSync(file, updated.join('\n'));
      fixed.add(relative(root, file));
    }
  }
}

if (fix) {
  console.log(fixed.size ? `Linked file references in:\n${[...fixed].join('\n')}` : 'No unlinked file references.');
} else if (failures.length) {
  console.error(`${failures.join('\n')}\nRun node scripts/check-file-links.mjs --fix.`);
  process.exitCode = 1;
} else {
  console.log('File references in skills are links.');
}
