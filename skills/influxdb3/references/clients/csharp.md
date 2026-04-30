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
