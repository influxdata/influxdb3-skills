# Go example

Two entry points share `package main` via build tags so they don't collide:

- `go run hello.go` — connects, writes 10 points, queries them back.
- `go run -tags=schema schema_example.go` — schema-design demo.

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.
