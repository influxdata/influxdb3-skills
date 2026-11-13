// Every bullet under "Live-verified" in a release's changelog section cites a claim ID.
const CLAIM_ID = /claim-\d{8}-\d{4}/;

export function uncitedLiveVerified(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  if (end < 0) end = lines.length;
  const bullets = [];
  let inSection = false;
  for (const line of lines.slice(start + 1, end)) {
    if (line.startsWith('### ')) inSection = /live-verified/i.test(line);
    else if (inSection && line.startsWith('- ')) bullets.push(line);
    else if (inSection && /^\s+\S/.test(line) && bullets.length) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  return bullets.filter((bullet) => !CLAIM_ID.test(bullet));
}
