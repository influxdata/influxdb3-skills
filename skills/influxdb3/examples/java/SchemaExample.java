import com.influxdb.v3.client.InfluxDBClient;
import com.influxdb.v3.client.Point;
import io.github.cdimascio.dotenv.Dotenv;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.util.stream.Stream;

public class SchemaExample {
    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        try (InfluxDBClient client = InfluxDBClient.getInstance(
                require(dotenv, "INFLUXDB_HOST"),
                require(dotenv, "INFLUXDB_TOKEN").toCharArray(),
                require(dotenv, "INFLUXDB_DATABASE"))) {

            Instant now = Instant.now();
            List<Point> points = new ArrayList<>();
            for (int minute = 0; minute < 60; minute++) {
                Instant ts = now.minus(60L - minute, ChronoUnit.MINUTES);
                for (String region : new String[] {"us-west", "us-east"}) {
                    for (int hostIdx = 0; hostIdx < 3; hostIdx++) {
                        // gpu_id is HIGH cardinality → field, not tag.
                        points.add(Point.measurement("sensor")
                            .setTag("host", String.format("server%02d", hostIdx))
                            .setTag("region", region)
                            .setFloatField("temperature", 70.0 + (minute % 5))
                            .setFloatField("humidity", 40.0 + (hostIdx % 3))
                            .setStringField("gpu_id",
                                String.format("gpu-%s-%d-%d", region, hostIdx, minute))
                            .setTimestamp(ts));
                    }
                }
            }
            System.out.printf("==> Writing %d points%n", points.size());
            client.writePoints(points);

            System.out.println("==> Avg temperature per region per 5-min bucket, last hour");
            String sql = """
                SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
                       AVG(temperature) AS avg_temp
                FROM sensor
                WHERE time >= now() - INTERVAL '1 hour'
                GROUP BY region, bucket
                ORDER BY bucket DESC, region
                """;
            try (Stream<Object[]> rows = client.query(sql)) {
                rows.forEach(r -> System.out.println(Arrays.toString(r)));
            }
        }
    }

    private static String require(Dotenv d, String k) {
        String v = d.get(k);
        if (v == null || v.isBlank()) {
            v = System.getenv(k);
        }
        if (v == null || v.isBlank()) throw new IllegalStateException("missing " + k);
        return v;
    }
}
