"""BROKEN: writes to a typo'd database name; "succeeds" silently.

Symptom: this script reports "==> Done", but the data is in `senor_data_<ts>`
(misspelled), NOT `sensor_data` (intended). When the developer queries
`SELECT * FROM sensor_data`, they see 0 rows and conclude something else
is wrong.

This is the silent auto-create misroute. The fix is in `fixed.py`.
"""
from __future__ import annotations

import os
import time

import requests
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]

    # NOTE: the developer *intended* "sensor_data" but typo'd "senor_data".
    # Without an existence check, v3 silently creates the typo'd DB on first write.
    intended_db = "sensor_data"  # what the developer thinks they're writing to
    actual_db = f"senor_data_{int(time.time())}"  # what the script ACTUALLY writes to

    print(f"==> Writing to '{actual_db}' (typo of '{intended_db}')")
    now = int(time.time())
    r = requests.post(
        f"{host}/api/v3/write_lp",
        params={"db": actual_db, "precision": "second"},
        headers={"Authorization": f"Bearer {token}"},
        data=f"sensors,host=h1 value=1.0 {now}".encode(),
        timeout=10,
    )
    print(f"   HTTP {r.status_code}")
    print("==> Done.")  # ← the lie. Data is NOT in `sensor_data`.


if __name__ == "__main__":
    main()
