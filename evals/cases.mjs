// Read eval cases from prompts.jsonl and build the user prompt a case shows,
// for both the Codex runner and the judges.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const evalsDir = dirname(fileURLToPath(import.meta.url));

export function readCases() {
  return readFileSync(join(evalsDir, 'prompts.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`prompts.jsonl line ${index + 1}: ${error.message}`);
      }
    });
}

export function promptFor(testCase, byId) {
  if (!testCase.follows) return testCase.prompt;
  const parent = byId.get(testCase.follows);
  if (!parent) throw new Error(`${testCase.id}: follows unknown case '${testCase.follows}'`);
  return `Earlier in this conversation I asked: "${promptFor(parent, byId)}"\n\n${testCase.prompt}`;
}

// The Codex sandbox is read-only, so a fixture is shown in the prompt instead
// of written to the working directory.
export function fixturePrompt(testCase) {
  const files = Object.entries(testCase.fixture?.files ?? {});
  if (!files.length) return '';
  return `The developer's project contains these files:\n\n` +
    files.map(([path, contents]) => `--- ${path} ---\n${contents}${contents.endsWith('\n') ? '' : '\n'}`).join('\n') + '\n';
}
