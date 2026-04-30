# Java example

```bash
mvn compile
mvn exec:java -Dexec.mainClass="Hello"
mvn exec:java -Dexec.mainClass="SchemaExample"
```

Set `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` in `.env` (copy from `.env.example`) or in your shell.

Requires JDK 17+ and Maven.
