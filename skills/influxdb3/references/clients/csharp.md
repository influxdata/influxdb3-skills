# C# Client (`InfluxDB3.Client`)

## Install

```bash
dotnet add package InfluxDB3.Client
dotnet add package DotNetEnv
```

## Construct the client

```csharp
using InfluxDB3.Client;
using DotNetEnv;

Env.Load();
using var client = new InfluxDBClient(
    host: Environment.GetEnvironmentVariable("INFLUXDB_HOST")!,
    token: Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")!,
    database: Environment.GetEnvironmentVariable("INFLUXDB_DATABASE")!
);
```

## Write a batch

```csharp
using InfluxDB3.Client.Write;

var points = Enumerable.Range(0, 1000).Select(_ =>
    PointData.Measurement("sensor")
        .SetTag("host", "server01")
        .SetTag("region", "us-west")
        .SetField("temperature", 72.4)
        .SetField("humidity", 45.1)
).ToList();
await client.WritePointsAsync(points);
```

## Batch-write error handling

For bulk writes, build fixed-size `List<PointData>` batches and send each batch with `WritePointsAsync`.
Put the call in a bounded retry loop.
Retry 429 and 5xx responses with exponential backoff and jitter.
Surface 400, 401, 403, and 404 without retrying.
This is basic write correctness, not workload-specific batch-size tuning.
The C# client doesn't expose the Python client's automatic `batch_size` or `flush_interval` settings.

See `references/writing.md` → "Error handling" for the status-code meanings.

`InfluxDB3.Client` 1.9.0+ writes through `/api/v2/write` by default, so one invalid line rejects the whole batch. For partial writes or `NoSync` on InfluxDB 3 Core or Enterprise, set the `UseV2Api` write option to `false`. See `references/writing.md` → "Official clients write through `/api/v2/write` by default".

## Parameterized SQL query

```csharp
var rows = client.Query(
    "SELECT * FROM sensor WHERE host = $host LIMIT 10",
    namedParameters: new Dictionary<string, object> { ["host"] = userSuppliedHost }
);
await foreach (var row in rows) {
    Console.WriteLine(string.Join(", ", row));
}
```

## Where to fetch more

`references/doc-urls.md` → "C#".
