"""FIXED: JSON.parse system.tokens.permissions before iterating.

The column is a JSON-encoded string of short-form permission strings:
  '[\"db:my_db:read\", \"db:my_db:write\"]'
Parse first, then iterate.

Quirk reference: `quirks.md` entry 4.
"""
from __future__ import annotations

import json
import os

import requests
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]

    r = requests.post(
        f"{host}/api/v3/query_sql",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"db": "_internal", "q": "SELECT name, permissions FROM system.tokens LIMIT 10"},
        timeout=10,
    )
    r.raise_for_status()
    rows = r.json()

    print("==> Tokens with db:gf_ha access (FIXED filter):")
    for row in rows:
        # CORRECT: parse the JSON string first.
        perms = json.loads(row["permissions"])  # now a list of short-form strings
        for perm in perms:
            if perm.startswith("db:gf_ha:"):
                print(f"   {row['name']!r} → {perm}")
                break


if __name__ == "__main__":
    main()
