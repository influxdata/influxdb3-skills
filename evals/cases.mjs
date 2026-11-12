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

export function userPromptWithEarlierTurns(testCase, casesById) {
  if (!testCase.follows) return testCase.prompt;
  const earlierCase = casesById.get(testCase.follows);
  if (!earlierCase) throw new Error(`${testCase.id}: follows unknown case '${testCase.follows}'`);
  return `Earlier in this conversation I asked: "${userPromptWithEarlierTurns(earlierCase, casesById)}"\n\n${testCase.prompt}`;
}

export function fixtureFilesAsPromptText(testCase) {
  const files = Object.entries(testCase.fixture?.files ?? {});
  if (!files.length) return '';
  return `The developer's project contains these files:\n\n` +
    files.map(([path, contents]) => `--- ${path} ---\n${contents}${contents.endsWith('\n') ? '' : '\n'}`).join('\n') + '\n';
}
