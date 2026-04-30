# Go Client (`influxdb3-go`)

## Install

```bash
go get github.com/InfluxCommunity/influxdb3-go/v2/influxdb3
go get github.com/joho/godotenv
```

## Construct the client

```go
import (
    "os"
    "github.com/InfluxCommunity/influxdb3-go/v2/influxdb3"
    "github.com/joho/godotenv"
)

_ = godotenv.Load()
client, err := influxdb3.New(influxdb3.ClientConfig{
    Host:     os.Getenv("INFLUXDB_HOST"),
    Token:    os.Getenv("INFLUXDB_TOKEN"),
    Database: os.Getenv("INFLUXDB_DATABASE"),
})
```

## Write a batch

```go
points := make([]*influxdb3.Point, 0, 1000)
for i := 0; i < 1000; i++ {
    points = append(points,
        influxdb3.NewPointWithMeasurement("sensor").
            SetTag("host", "server01").
            SetTag("region", "us-west").
            SetField("temperature", 72.4).
            SetField("humidity", 45.1),
    )
}
if err := client.WritePoints(ctx, points); err != nil { /* handle */ }
```

## Parameterized SQL query

```go
iter, err := client.QueryWithParameters(ctx,
    "SELECT * FROM sensor WHERE host = $host LIMIT 10",
    influxdb3.QueryParameters{"host": userSuppliedHost},
)
```

## Error handling

Inspect the error type / wrapped HTTP status. 429/5xx → retriable; 400/401/404 → non-retriable.

## Where to fetch more

`references/doc-urls.md` → "Go".
