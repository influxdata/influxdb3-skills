"""Schema example for InfluxDB 3 in Python.

Demonstrates a sensible measurement design:
  measurement: sensor
  tags:        host (low-cardinality), region (low-cardinality)
  fields:      temperature, humidity, gpu_id (high-cardinality identity)
  timestamp:   per-write

Then runs a representative aggregation query.
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from influxdb_client_3 import InfluxDBClient3, Point


def main() -> None:
    load_dotenv()
    client = InfluxDBClient3(
        host=os.environ["INFLUXDB_HOST"],
        token=os.environ["INFLUXDB_TOKEN"],
        database=os.environ["INFLUXDB_DATABASE"],
    )

    # Write 60 points across two regions and three hosts.
    now = int(time.time())
    points = []
    for minute in range(60):
        ts = now - (60 - minute) * 60
        for region in ("us-west", "us-east"):
            for host_idx in range(3):
                # gpu_id is HIGH cardinality (unique per host) → field, not tag.
                points.append(
                    Point("sensor")
                    .tag("host", f"server{host_idx:02d}")
                    .tag("region", region)
                    .field("temperature", 70.0 + (minute % 5))
                    .field("humidity", 40.0 + (host_idx % 3))
                    .field("gpu_id", f"gpu-{region}-{host_idx}-{minute}")
                    .time(ts, write_precision="s")
                )
    print(f"==> Writing {len(points)} points")
    client.write(record=points)

    print("==> Avg temperature per region per 5-min bucket, last hour")
    sql = """
        SELECT
          region,
          DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
          AVG(temperature) AS avg_temp
        FROM sensor
        WHERE time >= now() - INTERVAL '1 hour'
        GROUP BY region, bucket
        ORDER BY bucket DESC, region
    """
    for row in client.query(sql):
        print(row)


if __name__ == "__main__":
    main()
