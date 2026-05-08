"""Admin lifecycle example for InfluxDB 3 Enterprise.

Exercises a full token + database lifecycle (10 steps).
Cleanup runs in a try/finally so partial failures don't orphan tokens or DBs.

Targets Enterprise (uses /api/v3/enterprise/configure/token). For Core, change
the resource-token create endpoint to /api/v3/configure/token; database CRUD,
delete-token, and list-tokens-via-SQL are identical across Core and Enterprise.
"""
from __future__ import annotations

import os
import sys
import time

import requests
from dotenv import load_dotenv


def _admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


def _list_dbs(host: str, admin_token: str) -> list[str]:
    r = requests.get(
        f"{host}/api/v3/configure/database",
        params={"format": "json"},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    r.raise_for_status()
    return [row["iox::database"] for row in r.json()]


def _create_db(host: str, admin_token: str, db: str) -> None:
    r = requests.post(
        f"{host}/api/v3/configure/database",
        headers={**_admin_headers(admin_token), "Content-Type": "application/json"},
        json={"db": db},
        timeout=10,
    )
    r.raise_for_status()


def _delete_db(host: str, admin_token: str, db: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/database",
        params={"db": db},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def _create_scoped_token(host: str, admin_token: str, name: str, db: str) -> str:
    """Create an Enterprise scoped resource token; return the plaintext secret."""
    r = requests.post(
        f"{host}/api/v3/enterprise/configure/token",
        headers={**_admin_headers(admin_token), "Content-Type": "application/json"},
        json={
            "type": "resource",
            "token_name": name,
            "permissions": [
                {
                    "resource_type": "db",
                    "resource_names": [db],
                    "actions": ["read", "write"],
                }
            ],
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["token"]


def _delete_token(host: str, admin_token: str, name: str) -> None:
    r = requests.delete(
        f"{host}/api/v3/configure/token",
        params={"token_name": name},
        headers=_admin_headers(admin_token),
        timeout=10,
    )
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def _query_sql(host: str, admin_token: str, db: str, q: str) -> list[dict]:
    r = requests.post(
        f"{host}/api/v3/query_sql",
        headers={**_admin_headers(admin_token), "Content-Type": "application/json"},
        json={"db": db, "q": q},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def _write_point(host: str, scoped_token: str, db: str, line: str) -> int:
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

    ts = int(time.time())
    test_db = f"admin_test_python_{ts}"
    token_a = f"admin_test_python_token_{ts}_a"
    token_b = f"admin_test_python_token_{ts}_b"

    # Track what we've created so cleanup can revoke even on partial failure.
    state = {"db": None, "token_a": None, "token_b": None}

    try:
        print("==> step 1: list databases")
        dbs = _list_dbs(host, admin_token)
        print(f"   {len(dbs)} databases")

        print(f"==> step 2: create {test_db}")
        _create_db(host, admin_token, test_db)
        state["db"] = test_db

        print(f"==> step 3: create scoped token A for {test_db}")
        scoped_a = _create_scoped_token(host, admin_token, token_a, test_db)
        state["token_a"] = token_a
        print(f"  ok (secret captured, length {len(scoped_a)})")

        print("==> step 4: write a point with token A")
        now = int(time.time())
        sc = _write_point(host, scoped_a, test_db, f"lifecycle_test,host=h1 value=1.0 {now}")
        print(f"  HTTP {sc}")
        if sc not in (200, 204):
            raise RuntimeError(f"write returned {sc}")

        print(f"==> step 5: list tokens via SQL, find {token_a}")
        rows = _query_sql(
            host, admin_token, "_internal",
            f"SELECT name FROM system.tokens WHERE name = '{token_a}'",
        )
        matches = [r for r in rows if r.get("name") == token_a]
        print(f"  found: {len(matches)}")
        if not matches:
            raise RuntimeError("token A not found")

        print(f"==> step 6: rotate — create scoped token B for {test_db}")
        scoped_b = _create_scoped_token(host, admin_token, token_b, test_db)
        state["token_b"] = token_b

        print("==> step 7: verify B, delete A")
        sc = _write_point(host, scoped_b, test_db, f"lifecycle_test,host=h1 value=2.0 {now + 1}")
        if sc not in (200, 204):
            raise RuntimeError(f"write with B returned {sc}")
        _delete_token(host, admin_token, token_a)
        state["token_a"] = None

        print(f"==> step 8: delete {test_db}")
        _delete_db(host, admin_token, test_db)
        state["db"] = None

        print("==> step 9: delete token B")
        _delete_token(host, admin_token, token_b)
        state["token_b"] = None

        print("==> step 10: orphan check")
        db_orph = [d for d in _list_dbs(host, admin_token) if d.startswith("admin_test_python_")]
        rows = _query_sql(
            host, admin_token, "_internal",
            "SELECT name FROM system.tokens WHERE name LIKE 'admin_test_python_%'",
        )
        tok_orph = [r["name"] for r in rows if r.get("name", "").startswith("admin_test_python_")]
        print(f"  database orphans: {db_orph or '<none>'}")
        print(f"  token orphans:    {tok_orph or '<none>'}")
        if db_orph or tok_orph:
            raise RuntimeError("orphans found")

        print("==> Done. Lifecycle completed cleanly.")
        return 0
    finally:
        if state.get("token_a"):
            try:
                _delete_token(host, admin_token, state["token_a"])
                print(f"  cleanup: deleted leftover token A {state['token_a']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete token A: {exc}")
        if state.get("token_b"):
            try:
                _delete_token(host, admin_token, state["token_b"])
                print(f"  cleanup: deleted leftover token B {state['token_b']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete token B: {exc}")
        if state.get("db"):
            try:
                _delete_db(host, admin_token, state["db"])
                print(f"  cleanup: deleted leftover DB {state['db']}")
            except Exception as exc:
                print(f"  cleanup: failed to delete DB: {exc}")


if __name__ == "__main__":
    sys.exit(main())
