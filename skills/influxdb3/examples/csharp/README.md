# C# example

```bash
dotnet restore
dotnet run                                   # runs Hello.Main
```

To run `SchemaExample` instead, change the `<StartupObject>` in `Hello.csproj` to `InfluxHello.SchemaExample` (and rename `Main` to `Main` in that class), or call `SchemaExample.RunAsync()` from `Hello.Main`.

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.

Requires .NET 8.0+.
