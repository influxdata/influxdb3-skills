"""InfluxDB 3 diagnostic toolkit.

Runs a one-page health check:
  - HEAD /ping  (expecting 404 — known quirk; included to surface it)
  - GET /ping   (expecting 200; reports flavor + version from x-influxdb-build / x-influxdb-version)
  - List databases visible to the token (count + first 5)
  - If admin scope: create diagnose_<ts> DB, write a smoke point, query it back, delete the DB
  - If non-admin: skip the write smoke; report "diagnostic limited to read-side"

Output is the first thing a customer should paste to Claude when something feels off.

Reads INFLUXDB_HOST and INFLUXDB_TOKEN from env or .env.
"""
from __future__ import annotations

import os
import sys
import time
from typing import Optional

import requests
from dotenv import load_dotenv


def _admin_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def head_ping(host: str) -> tuple[int, dict]:
    """HEAD /ping — expected 404 (known quirk)."""
    r = requests.head(f"{host}/ping", timeout=5)
    return r.status_code, dict(r.headers)


def get_ping(host: str, token: str) -> tuple[int, dict]:
    r = requests.get(f"{host}/ping", headers=_admin_headers(token), timeout=5)
    return r.status_code, dict(r.headers)


def list_dbs(host: str, token: str) -> Optional[list[str]]:
    r = requests.get(
        f"{host}/api/v3/configure/database",
        params={"format": "json"},
        headers=_admin_headers(token),
        timeout=10,
    )
    if r.status_code != 200:
        return None
    return [row["iox::database"] for row in r.json()]


def create_db(host: str, token: str, db: str) -> int:
    r = requests.post(
        f"{host}/api/v3/configure/database",
        headers={**_admin_headers(token), "Content-Type": "application/json"},
        json={"db": db},
        timeout=10,
    )
    return r.status_code


def delete_db(host: str, token: str, db: str) -> int:
    r = requests.delete(
        f"{host}/api/v3/configure/database",
        params={"db": db},
        headers=_admin_headers(token),
        timeout=10,
    )
    return r.status_code


def write_lp(host: str, token: str, db: str, line: str) -> int:
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": db, "precision": "second"},
        headers=_admin_headers(token),
        data=line.encode(),
        timeout=10,
    )
    return r.status_code


def query_sql(host: str, token: str, db: str, q: str) -> Optional[list[dict]]:
    r = requests.post(
        f"{host}/api/v3/query_sql",
        headers={**_admin_headers(token), "Content-Type": "application/json"},
        json={"db": db, "q": q},
        timeout=10,
    )
    if r.status_code != 200:
        return None
    return r.json()


def main() -> int:
    load_dotenv()
    host = os.environ.get("INFLUXDB_HOST")
    token = os.environ.get("INFLUXDB_TOKEN")
    if not host or not token:
        print("FAIL: INFLUXDB_HOST and INFLUXDB_TOKEN must be set in env or .env")
        return 1

    print("InfluxDB 3 diagnostic — health report")
    print("=" * 50)
    print(f"host: {host}")
    print()

    # 1. HEAD /ping (expected 404 — quirk)
    print("[1] HEAD /ping (expecting 404 — known quirk; only GET works)")
    try:
        sc, _ = head_ping(host)
        print(f"    status: {sc}", "(expected — see references/quirks.md entry 1)" if sc == 404 else "(unexpected)")
    except Exception as exc:
        print(f"    FAIL: connection error: {exc}")
        return 1
    print()

    # 2. GET /ping
    print("[2] GET /ping (expecting 200)")
    try:
        sc, headers = get_ping(host, token)
    except Exception as exc:
        print(f"    FAIL: connection error: {exc}")
        return 1
    if sc != 200:
        print(f"    FAIL: status {sc}")
        if sc == 401:
            print("    → token rejected. Confirm INFLUXDB_TOKEN value and host match.")
        return 1
    flavor = headers.get("x-influxdb-build", "<missing>")
    version = headers.get("x-influxdb-version", "<missing>")
    print(f"    status: 200")
    print(f"    flavor: {flavor}")
    print(f"    version: {version}")
    print()

    # 3. list databases
    print("[3] List databases visible to token")
    dbs = list_dbs(host, token)
    if dbs is None:
        print("    FAIL: list databases returned non-200 (token may lack scope)")
        return 1
    print(f"    count: {len(dbs)}")
    sample = dbs[:5]
    print(f"    first 5: {sample}")
    print()

    # 4. write smoke (only if admin scope; detect via attempt to create a throwaway DB)
    ts = int(time.time())
    test_db = f"diagnose_{ts}"
    print(f"[4] Write+query smoke (creating throwaway DB {test_db})")
    sc = create_db(host, token, test_db)
    if sc != 200:
        print(f"    SKIP: create database returned {sc} (token likely lacks admin scope)")
        print("    diagnostic limited to read-side; provide an admin token for full check")
        print()
        print("Done. (Read-side health: OK)")
        return 0
    try:
        # write
        now = int(time.time())
        sc = write_lp(host, token, test_db, f"diagnose_smoke,host=h1 value=1.0 {now}")
        if sc not in (200, 204):
            print(f"    FAIL: write returned {sc}")
            return 1
        print(f"    write: HTTP {sc}")
        # query
        rows = query_sql(host, token, test_db, "SELECT count(*) AS n FROM diagnose_smoke")
        if rows is None or not rows:
            print("    FAIL: query returned nothing")
            return 1
        print(f"    query count: {rows[0].get('n')}")
    finally:
        sc = delete_db(host, token, test_db)
        if sc not in (200, 204, 404):
            print(f"    WARN: cleanup of {test_db} returned {sc}; check for orphan")
        else:
            print(f"    cleanup: deleted {test_db}")
    print()

    print("Done. (Full health: OK)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
