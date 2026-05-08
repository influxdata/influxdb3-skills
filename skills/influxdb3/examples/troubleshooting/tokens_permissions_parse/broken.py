"""BROKEN: treats system.tokens.permissions as a list; iterates characters.

Symptom: looking for tokens with `db:my_db:read,write` permissions, but the
filter `'db:my_db' in perm` always matches because `perm` is iterating
single characters of the JSON-encoded string.

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
    for row in rows:
        # WRONG: row["permissions"] is a JSON-encoded string, not a list.
        # This iteration walks characters, so 'db:gf_ha' is "in" any string
        # containing those characters in sequence.
        for perm in row["permissions"]:
            if "db:gf_ha" in perm:
                print(f"   {row['name']!r} (matched on character '{perm}')")
                break


if __name__ == "__main__":
    main()
