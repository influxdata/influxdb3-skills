#!/usr/bin/env bash
# Fails when the plugin manifests and SKILL.md metadata disagree on the version.
set -euo pipefail

cd "$(dirname "$0")/.."

expected=$(jq -r .version plugin.json)
status=0

check() {
  local source=$1 actual=$2
  if [[ "$actual" != "$expected" ]]; then
    echo "::error file=${source}::version ${actual} doesn't match plugin.json ${expected}"
    status=1
  fi
}

check .claude-plugin/plugin.json "$(jq -r .version .claude-plugin/plugin.json)"

for skill in skills/*/SKILL.md; do
  actual=$(sed -n 's/^  version: "\(.*\)"$/\1/p' "$skill")
  check "$skill" "${actual:-missing}"
done

if [[ $status -eq 0 ]]; then
  echo "All versions match ${expected}."
fi
exit "$status"
