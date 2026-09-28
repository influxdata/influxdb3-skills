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

`influxdb3-python` 0.20.0+ writes through `/api/v2/write` by default, so one invalid line rejects the whole batch. For partial writes or `no_sync` on InfluxDB 3 Core or Enterprise, pass `write_use_v2_api=False`. See `references/writing.md` → "Official clients write through `/api/v2/write` by default".

## Automatic batching

For high throughput, let the client batch in the background. Build a `WriteOptions` instance and pass it through the `write_client_options()` helper:

```python
from influxdb_client_3 import InfluxDBClient3, WriteOptions, write_client_options

write_options = WriteOptions(
    batch_size=1_000,       # write when this many points are queued
    flush_interval=1_000,   # or after this many milliseconds, whichever comes first
    max_retries=5,          # retries for retriable failures
    retry_interval=5_000,
    max_retry_delay=30_000,
    exponential_base=2,
)
wco = write_client_options(
    write_options=write_options,
    success_callback=lambda conf, data: None,
    error_callback=lambda conf, data, exc: print(f"write failed: {exc}"),
    retry_callback=lambda conf, data, exc: print(f"retrying: {exc}"),
)

with InfluxDBClient3(
    host=os.environ["INFLUXDB_HOST"],
    token=os.environ["INFLUXDB_TOKEN"],
    database=os.environ["INFLUXDB_DATABASE"],
    write_client_options=wco,
) as client:
    client.write(record=points)
```

- `WriteOptions()` defaults to batching mode with `batch_size=1_000` and `flush_interval=1_000`.
- Retry settings live on `WriteOptions`; there's no separate retry API.
- In batching mode, a failed batch doesn't raise from `write()`; it goes to `error_callback`.
- Don't pass `write_options=` to `InfluxDBClient3` directly, and don't put `batch_size` in `write_client_options()`. The client ignores both, so the code doesn't batch.

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
