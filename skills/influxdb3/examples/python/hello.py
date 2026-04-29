"""Hello-world for InfluxDB 3 in Python.

Connects, writes 10 points, queries them back, prints results.
Reads connection info from .env (or the environment).
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from influxdb_client_3 import InfluxDBClient3, Point


def main() -> None:
    load_dotenv()
    host = os.environ["INFLUXDB_HOST"]
    token = os.environ["INFLUXDB_TOKEN"]
    database = os.environ["INFLUXDB_DATABASE"]

    client = InfluxDBClient3(host=host, token=token, database=database)

    now = int(time.time())
    points = [
        Point("sensor")
        .tag("host", "server01")
        .tag("region", "us-west")
        .field("temperature", 70.0 + i * 0.3)
        .field("humidity", 40.0 + i * 0.5)
        .time(now - (10 - i) * 60, write_precision="s")
        for i in range(10)
    ]
    print(f"==> Writing {len(points)} points to {database} on {host}")
    client.write(record=points)

    print("==> Querying last 10 rows back")
    rows = client.query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10")
    for row in rows:
        print(row)

    print("==> Done")


if __name__ == "__main__":
    main()
