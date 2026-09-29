#!/usr/bin/env bash
# Fails when a tracked file contains a personal home directory such as
# /Users/alice or /home/alice. Eval results record working directories, so this
# keeps a contributor's username out of committed evidence.
#
#   scripts/check-paths.sh        list matches and exit 1
#   scripts/check-paths.sh --fix  rewrite matches to /Users/USER or /home/USER
set -euo pipefail

cd "$(dirname "$0")/.."

# A home directory: /Users/<name> or /home/<name> at the start of a path.
# The lookbehind skips sandbox paths such as /private/tmp/e-abc/home/cwd, and the
# lookahead skips placeholder names used in docs.
pattern='(?<![\w./-])/(Users|home)/(?!(?:you|user|username|example|runner|USER)\b)[\w.-]+'

files=()
while IFS= read -r -d '' file; do
  [[ "$file" == scripts/check-paths.sh ]] && continue
  files+=("$file")
done < <(git ls-files -z --cached --deduplicate)

matches=$(perl -ne "print \"\$ARGV:\$.: \$&\n\" if m{$pattern}; close ARGV if eof" "${files[@]}" 2>/dev/null || true)

if [[ -z "$matches" ]]; then
  echo "No personal home directories in tracked files."
  exit 0
fi

if [[ "${1:-}" == "--fix" ]]; then
  changed=()
  while IFS= read -r file; do changed+=("$file"); done < <(printf '%s\n' "$matches" | cut -d: -f1 | sort -u)
  perl -pi -e "s{$pattern}{/\$1/USER}g" "${changed[@]}"
  echo "Rewrote home directories in:"
  printf '%s\n' "${changed[@]}"
  exit 0
fi

while IFS= read -r line; do
  file=${line%%:*}; rest=${line#*:}; num=${rest%%:*}
  echo "::error file=${file},line=${num}::personal home directory '${rest#*: }'. Run scripts/check-paths.sh --fix."
done <<<"$matches"
exit 1
