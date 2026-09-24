using DotNetEnv;
using InfluxDB3.Client;
using InfluxDB3.Client.Write;

namespace InfluxHello;

public static class SchemaExample {
    public static async Task RunAsync() {
        Env.Load();
        using var client = new InfluxDBClient(
            host: Environment.GetEnvironmentVariable("INFLUXDB_HOST")!,
            token: Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")!,
            database: Environment.GetEnvironmentVariable("INFLUXDB_DATABASE")!
        );

        var now = DateTimeOffset.UtcNow;
        var points = new List<PointData>();
        for (int minute = 0; minute < 60; minute++) {
            var ts = now.AddMinutes(-(60 - minute)).UtcDateTime;
            foreach (var region in new[] { "us-west", "us-east" }) {
                for (int hostIdx = 0; hostIdx < 3; hostIdx++) {
                    points.Add(PointData.Measurement("sensor")
                        .SetTag("host", $"server{hostIdx:D2}")
                        .SetTag("region", region)
                        .SetField("temperature", 70.0 + (minute % 5))
                        .SetField("humidity", 40.0 + (hostIdx % 3))
                        .SetTimestamp(ts));
                }
            }
        }
        Console.WriteLine($"==> Writing {points.Count} points");
        await client.WritePointsAsync(points);

        Console.WriteLine("==> Avg temperature per region per 5-min bucket, last hour");
        const string sql = """
            SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
                   AVG(temperature) AS avg_temp
            FROM sensor
            WHERE time >= now() - INTERVAL '1 hour'
            GROUP BY region, bucket
            ORDER BY bucket DESC, region
            """;
        var rows = client.Query(sql);
        await foreach (var row in rows) {
            Console.WriteLine(string.Join(", ", row));
        }
    }
}
