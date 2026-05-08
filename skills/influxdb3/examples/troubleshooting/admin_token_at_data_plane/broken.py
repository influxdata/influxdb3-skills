"""BROKEN: application code uses the admin token for data-plane writes.

This works (admin scope is broad enough), but it's a security anti-pattern:
- One leaked admin token = total compromise of every database.
- Application code accidentally has the ability to create + delete databases.
- Rotating the admin token requires rotating EVERY application's secret store.

The fix is to create a scoped resource token at deploy time and use that
for runtime writes. The admin token stays in the deploy/CI environment only.
"""
from __future__ import annotations

import os
import time

import requests
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    admin_token = os.environ["INFLUXDB_TOKEN"]  # ← whatever the customer happens to have
    db = os.environ.get("INFLUXDB_DATABASE", "claude_skill_test")

    # ANTI-PATTERN: using an admin token for runtime writes.
    print(f"==> Writing to '{db}' with the admin token (anti-pattern)")
    now = int(time.time())
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": db, "precision": "second"},
        headers={"Authorization": f"Bearer {admin_token}"},  # ← admin token at the data plane
        data=f"sensors,host=h1 value=1.0 {now}".encode(),
        timeout=10,
    )
    print(f"   HTTP {r.status_code}")
    # The write probably "works", but the application now has admin powers.
    # If this script's secret manager leaks, the attacker can create/drop DBs.


if __name__ == "__main__":
    main()
