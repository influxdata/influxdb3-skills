# Python Client (`influxdb3-python`)

## Install

```bash
pip install influxdb3-python python-dotenv
```

## Construct the client

```python
from dotenv import load_dotenv
import os
from influxdb_client_3 import InfluxDBClient3

load_dotenv()
client = InfluxDBClient3(
    host=os.environ["INFLUXDB_HOST"],
    token=os.environ["INFLUXDB_TOKEN"],
    database=os.environ["INFLUXDB_DATABASE"],
)
```

## Write a batch (line protocol)

```python
from influxdb_client_3 import Point

points = [
    Point("sensor")
        .tag("host", "server01")
        .tag("region", "us-west")
        .field("temperature", 72.4)
        .field("humidity", 45.1)
    for _ in range(1000)
]
client.write(record=points)
```

`influxdb3-python` 0.20.0 and later writes through `/api/v2/write` by default, so one invalid line rejects the whole batch. For partial writes or `no_sync` on InfluxDB 3 Core or Enterprise, pass `write_use_v2_api=False`. See `references/writing.md` → "Official clients write through `/api/v2/write` by default".

For high throughput, use the client's batching options (see https://github.com/InfluxCommunity/influxdb3-python). Default rule: batch ≥ 1,000 points or flush every 1 second.

## Parameterized SQL query

```python
result = client.query(
    query="SELECT * FROM sensor WHERE host = $host LIMIT 10",
    query_parameters={"host": user_supplied_host},  # never f-string user input
)
for row in result:
    print(row)
```

> Note: as of `influxdb3-python` 0.19.x, the keyword for parameters is `query_parameters` (not `parameters`). Always pass user input here, never via string formatting.

## Error handling

```python
from influxdb_client_3 import InfluxDBError

try:
    client.write(record=points)
except InfluxDBError as e:
    if e.response and e.response.status in (429, 500, 502, 503, 504):
        # retriable — back off and retry
        ...
    else:
        # 400/401/404 — fix and don't retry blindly
        raise
```

## Where to fetch more

`references/doc-urls.md` → "Python".
