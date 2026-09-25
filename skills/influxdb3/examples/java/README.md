# Java example

```bash
export MAVEN_OPTS="--add-opens=java.base/java.nio=ALL-UNNAMED"
# JDK 23+: also add --sun-misc-unsafe-memory-access=allow (required on JDK 27)
mvn compile
mvn exec:java -Dexec.mainClass="Hello"
mvn exec:java -Dexec.mainClass="SchemaExample"
```

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.

Requires JDK 17+ and Maven. Queries use Apache Arrow Flight, which needs the JVM options above; see `references/clients/java.md` → "JVM flags".
