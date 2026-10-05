#!/usr/bin/env python3
"""Fails when known-issue caveats and known-issues.toml disagree, or when a caveat is stale.

A caveat is stale when a skill's docs_checked_against version for a product is
newer than the entry's verified_on, or has reached the entry's fixed_in.
"""

import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = re.compile(r"<!-- (/?)known-issue(?:: ([a-z0-9-]+))? -->")
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")
CHECKED = re.compile(r'^  docs_checked_against: "(.*)"$', re.MULTILINE)


def version_key(version: str) -> tuple:
    """Semver ordering: a pre-release sorts before its release."""
    match = SEMVER.match(version)
    if not match:
        raise ValueError(f"not a semver version: {version!r}")
    major, minor, patch, pre = match.groups()
    core = (int(major), int(minor), int(patch))
    if pre is None:
        return core + ((1,),)
    # Numeric identifiers sort before alphanumeric ones.
    parts = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in pre.split("."))
    return core + ((0,) + parts,)


def checked_against(skill_md: Path) -> dict[str, str]:
    """Parse 'influxdb3-core 3.12.0, influxdb3-enterprise 3.12.0' into a dict."""
    match = CHECKED.search(skill_md.read_text())
    if not match:
        return {}
    pairs = (item.strip().split() for item in match.group(1).split(","))
    return {product: version for product, version in pairs}


def find_markers(errors: list[str]) -> dict[str, set[Path]]:
    """Map each known-issue ID to the skill directories that mark it."""
    found: dict[str, set[Path]] = {}
    for path in sorted((ROOT / "skills").rglob("*.md")):
        open_id = None
        for match in MARKER.finditer(path.read_text()):
            closing, issue_id = match.groups()
            where = path.relative_to(ROOT)
            if closing:
                if open_id is None:
                    errors.append(f"{where}: closing marker without an opening marker")
                open_id = None
            elif issue_id is None:
                errors.append(f"{where}: opening marker without an ID")
            else:
                if open_id is not None:
                    errors.append(
                        f"{where}: marker {issue_id!r} opens before {open_id!r} closes"
                    )
                open_id = issue_id
                skill_dir = path.relative_to(ROOT / "skills").parts[0]
                found.setdefault(issue_id, set()).add(ROOT / "skills" / skill_dir)
        if open_id is not None:
            errors.append(f"{path.relative_to(ROOT)}: marker {open_id!r} never closes")
    return found


def main() -> int:
    errors: list[str] = []
    issues = tomllib.loads((ROOT / "known-issues.toml").read_text()).get("issue", [])
    registered = {issue["id"]: issue for issue in issues}
    markers = find_markers(errors)

    for issue_id in sorted(markers.keys() - registered.keys()):
        errors.append(f"marker {issue_id!r} has no entry in known-issues.toml")
    for issue_id in sorted(registered.keys() - markers.keys()):
        errors.append(f"known-issues.toml entry {issue_id!r} has no marker in skills/")

    for issue_id, skill_dirs in sorted(markers.items()):
        issue = registered.get(issue_id)
        if issue is None:
            continue
        for skill_dir in sorted(skill_dirs):
            checked = checked_against(skill_dir / "SKILL.md")
            for product, verified in issue["verified_on"].items():
                current = checked.get(product)
                skill = skill_dir.name
                if current is None:
                    errors.append(
                        f"{skill}: docs_checked_against has no {product} version for {issue_id!r}"
                    )
                    continue
                if version_key(current) > version_key(verified):
                    errors.append(
                        f"{issue_id!r} was verified on {product} {verified}, but {skill} is checked against "
                        f"{current}. Rerun the evidence probe, then update verified_on or remove the caveat."
                    )
                fixed = issue.get("fixed_in", {}).get(product)
                if fixed and version_key(current) >= version_key(fixed):
                    errors.append(
                        f"{issue_id!r} is fixed in {product} {fixed}, and {skill} is checked against "
                        f"{current}. Remove the caveat and the entry."
                    )

    for error in errors:
        print(f"::error::{error}")
    if not errors:
        print(f"{len(registered)} known issues match their caveats and are current.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
