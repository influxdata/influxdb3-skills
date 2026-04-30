using DotNetEnv;
using InfluxDB3.Client;
using InfluxDB3.Client.Write;
using InfluxDB3.Client.Query;

namespace InfluxHello;

public static class Hello {
    public static async Task Main() {
        Env.Load();
        var host = Require("INFLUXDB_HOST");
        var token = Require("INFLUXDB_TOKEN");
        var database = Require("INFLUXDB_DATABASE");

        using var client = new InfluxDBClient(host: host, token: token, database: database);

        var now = DateTimeOffset.UtcNow;
        var points = Enumerable.Range(0, 10).Select(i =>
            PointData.Measurement("sensor")
                .SetTag("host", "server01")
                .SetTag("region", "us-west")
                .SetField("temperature", 70.0 + i * 0.3)
                .SetField("humidity", 40.0 + i * 0.5)
                .SetTimestamp(now.AddMinutes(-(10 - i)).UtcDateTime)
        ).ToList();

        Console.WriteLine($"==> Writing {points.Count} points to {database} on {host}");
        await client.WritePointsAsync(points);

        Console.WriteLine("==> Querying last 10 rows back");
        var rows = client.Query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10");
        await foreach (var row in rows) {
            Console.WriteLine(string.Join(", ", row));
        }
        Console.WriteLine("==> Done");
    }

    private static string Require(string k) =>
        Environment.GetEnvironmentVariable(k)
            ?? throw new InvalidOperationException($"missing env {k}");
}
