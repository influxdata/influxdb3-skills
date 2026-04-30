import com.influxdb.v3.client.InfluxDBClient;
import com.influxdb.v3.client.Point;
import io.github.cdimascio.dotenv.Dotenv;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.util.stream.Stream;

public class Hello {
    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        String host = require(dotenv, "INFLUXDB_HOST");
        String token = require(dotenv, "INFLUXDB_TOKEN");
        String database = require(dotenv, "INFLUXDB_DATABASE");

        try (InfluxDBClient client =
                 InfluxDBClient.getInstance(host, token.toCharArray(), database)) {

            Instant now = Instant.now();
            List<Point> points = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                points.add(Point.measurement("sensor")
                    .setTag("host", "server01")
                    .setTag("region", "us-west")
                    .setFloatField("temperature", 70.0 + i * 0.3)
                    .setFloatField("humidity", 40.0 + i * 0.5)
                    .setTimestamp(now.minus(10L - i, ChronoUnit.MINUTES)));
            }
            System.out.printf("==> Writing %d points to %s on %s%n",
                points.size(), database, host);
            client.writePoints(points);

            System.out.println("==> Querying last 10 rows back");
            try (Stream<Object[]> rows =
                     client.query("SELECT * FROM sensor ORDER BY time DESC LIMIT 10")) {
                rows.forEach(r -> System.out.println(Arrays.toString(r)));
            }
            System.out.println("==> Done");
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
