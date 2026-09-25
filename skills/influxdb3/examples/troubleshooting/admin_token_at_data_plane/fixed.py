"""FIXED: provision a scoped resource token at startup; use that for runtime writes.

Creates a scoped token via the admin token at deploy/init time, stores it as
the application's actual secret, and uses it for runtime writes. The admin
token never appears in the runtime data-plane code path.

Demonstrates trapped cleanup of the deploy-time token after the demo runs.
For real production deploys, the scoped token is provisioned ONCE during
infrastructure setup, then rotated per `references/tokens.md`.
"""
from __future__ import annotations

import os
import sys
import time

import requests
from dotenv import load_dotenv


def create_scoped_token(host: str, admin_token: str, name: str, db: str) -> str:
    """Enterprise and InfluxDB 3 Cloud only. Core has no resource tokens (references/tokens.md)."""
    r = requests.post(
        f"{host}/api/v3/enterprise/configure/token",
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        json={
            "type": "resource",
            "token_name": name,
            "permissions": [
                {"resource_type": "db", "resource_names": [db], "actions": ["read", "write"]}
            ],
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["token"]


def delete_token(host: str, admin_token: str, name: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/token",
        params={"token_name": name},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def write_lp(host: str, scoped_token: str, db: str, line: str) -> int:
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": db, "precision": "second"},
        headers={"Authorization": f"Bearer {scoped_token}"},
        data=line.encode(),
        timeout=10,
    )
    return r.status_code


def main() -> int:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    admin_token = os.environ["INFLUXDB_TOKEN"]
    db = os.environ.get("INFLUXDB_DATABASE", "claude_skill_test")

    ts = int(time.time())
    scoped_name = f"admin_test_app_token_{ts}"

    # 1. PROVISIONING (admin token used here, then never again)
    print(f"==> [provision] creating scoped token '{scoped_name}' for '{db}'")
    scoped_token = create_scoped_token(host, admin_token, scoped_name, db)
    print(f"   ok (secret length {len(scoped_token)})")

    try:
        # 2. RUNTIME (only the scoped token is used)
        print(f"==> [runtime] writing to '{db}' with the scoped token")
        now = int(time.time())
        sc = write_lp(host, scoped_token, db, f"sensors,host=h1 value=1.0 {now}")
        print(f"   HTTP {sc}")
        if sc not in (200, 204):
            print("   FAIL")
            return 1
        return 0
    finally:
        # 3. CLEANUP — for the demo. In production, the scoped token persists
        #    until rotated. Cleanup uses the admin token (provisioning scope).
        print(f"==> [cleanup] revoking '{scoped_name}'")
        delete_token(host, admin_token, scoped_name)


if __name__ == "__main__":
    sys.exit(main())
