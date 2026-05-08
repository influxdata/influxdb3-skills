"""BROKEN: treats system.tokens.permissions as a list; iterates characters.

Symptom: looking for tokens with `db:my_db:*` permissions returns ZERO
matches even though tokens with those permissions exist. Why: iterating
`row["permissions"]` walks the JSON-encoded *string* one character at a
time, so `perm` is just a single character like `[` or `"` — and
`"db:my_db" in "<single_char>"` is always False. The dev sees an empty
result and incorrectly concludes "no tokens match."

Quirk reference: `quirks.md` entry 4.
"""
from __future__ import annotations

import os

import requests
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]

    # Query system.tokens
    r = requests.post(
        f"{host}/api/v3/query_sql",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"db": "_internal", "q": "SELECT name, permissions FROM system.tokens LIMIT 10"},
        timeout=10,
    )
    r.raise_for_status()
    rows = r.json()

    print("==> Tokens with db:gf_ha access (BROKEN filter):")
    matched = 0
    for row in rows:
        # WRONG: row["permissions"] is a JSON-encoded string, not a list.
        # Iterating walks characters, so `perm` is just a single char like
        # `[` or `"` — and "db:gf_ha" is never a substring of a single char.
        # Result: zero matches, even when matching tokens exist.
        for perm in row["permissions"]:
            if "db:gf_ha" in perm:
                print(f"   {row['name']!r} → {perm}")
                matched += 1
                break
    print(f"   (matched {matched})")


if __name__ == "__main__":
    main()
