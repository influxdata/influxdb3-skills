# Java Client (`influxdb3-java`)

## Maven dependency

```xml
<dependency>
  <groupId>com.influxdb</groupId>
  <artifactId>influxdb3-java</artifactId>
  <version>1.9.0</version>
</dependency>
<dependency>
  <groupId>io.github.cdimascio</groupId>
  <artifactId>dotenv-java</artifactId>
  <version>3.0.0</version>
</dependency>
```

> Pin to the latest stable. `references/doc-urls.md` → Java for the current release.

## Construct the client

```java
import com.influxdb.v3.client.InfluxDBClient;
import io.github.cdimascio.dotenv.Dotenv;

Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
InfluxDBClient client = InfluxDBClient.getInstance(
    dotenv.get("INFLUXDB_HOST"),
    dotenv.get("INFLUXDB_TOKEN").toCharArray(),
    dotenv.get("INFLUXDB_DATABASE")
);
```

## Write a batch

```java
import com.influxdb.v3.client.Point;

List<Point> points = new ArrayList<>();
for (int i = 0; i < 1000; i++) {
    points.add(Point.measurement("sensor")
        .setTag("host", "server01")
        .setTag("region", "us-west")
        .setFloatField("temperature", 72.4)
        .setFloatField("humidity", 45.1));
}
client.writePoints(points);
```

`influxdb3-java` 1.10.0 and later writes through `/api/v2/write` by default, so one invalid line rejects the whole batch. For partial writes or `noSync` on InfluxDB 3 Core or Enterprise, set the `useV2Api` write option to `false`. See `references/writing.md` → "Official clients write through `/api/v2/write` by default".

## Parameterized SQL query

```java
QueryOptions opts = new QueryOptions().withQueryType(QueryType.SQL)
    .withParameters(Map.of("host", userSuppliedHost));
try (Stream<Object[]> rows = client.query(
        "SELECT * FROM sensor WHERE host = $host LIMIT 10", opts)) {
    rows.forEach(r -> System.out.println(Arrays.toString(r)));
}
```

## Where to fetch more

`references/doc-urls.md` → "Java".
