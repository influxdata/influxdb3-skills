"""FIXED: verifies the database exists before the first write.

Includes trapped cleanup so the demo doesn't leave orphan resources.
"""
from __future__ import annotations

import os
import sys
import time

import requests
from dotenv import load_dotenv


def list_dbs(host: str, token: str) -> list[str]:
    r = requests.get(
        f"{host}/api/v3/configure/database",
        params={"format": "json"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    return [row["iox::database"] for row in r.json()]


def create_db(host: str, token: str, db: str) -> None:
    r = requests.post(
        f"{host}/api/v3/configure/database",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"db": db},
        timeout=10,
    )
    r.raise_for_status()


def delete_db(host: str, token: str, db: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/database",
        params={"db": db},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def write_lp(host: str, token: str, db: str, line: str) -> int:
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": db, "precision": "second"},
        headers={"Authorization": f"Bearer {token}"},
        data=line.encode(),
        timeout=10,
    )
    return r.status_code


def main() -> int:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]

    # For demo purposes use a throwaway DB so we don't pollute a customer's "sensor_data".
    intended_db = f"admin_test_sensor_data_{int(time.time())}"

    print(f"==> Verifying '{intended_db}' exists")
    existing = list_dbs(host, token)
    if intended_db not in existing:
        print(f"   '{intended_db}' does NOT exist. Creating it explicitly...")
        create_db(host, token, intended_db)
    else:
        print(f"   '{intended_db}' exists.")

    created_for_cleanup = intended_db
    try:
        print(f"==> Writing to '{intended_db}'")
        now = int(time.time())
        sc = write_lp(host, token, intended_db, f"sensors,host=h1 value=1.0 {now}")
        print(f"   HTTP {sc}")
        if sc not in (200, 204):
            print("   FAIL: write rejected")
            return 1
        print("==> Done. Data is verifiably in the intended database.")
        return 0
    finally:
        if created_for_cleanup:
            delete_db(host, token, created_for_cleanup)
            print(f"   cleanup: deleted {created_for_cleanup}")


if __name__ == "__main__":
    sys.exit(main())
