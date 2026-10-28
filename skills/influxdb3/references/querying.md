# Querying InfluxDB 3

## SQL is the default

InfluxDB 3 supports SQL (Apache DataFusion under the hood) and InfluxQL. Use the language the developer asks for. When they don't say, generate SQL.

InfluxDB 3 doesn't run Flux. Migration from Flux is out of scope; see SKILL.md §9.

## Time idioms

```sql
-- Last hour
WHERE time >= now() - INTERVAL '1 hour'

-- Specific window
WHERE time BETWEEN '2026-04-29T00:00:00Z' AND '2026-04-29T01:00:00Z'

-- Bucketed aggregation
SELECT
  region,
  DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
  AVG(temperature) AS avg_temp
FROM sensor
WHERE time >= now() - INTERVAL '1 hour'
GROUP BY region, bucket
ORDER BY bucket DESC, region
```

`DATE_BIN` is the v3 way to bucket on time. Don't reach for `time_bucket` (that's a TimescaleDB idiom — it'll fail).

> **`format=json` returns timestamps as ISO-8601 strings, not nanosecond ints.** Do time math in SQL, not on the client: `... date_part('epoch', MAX(time)) - date_part('epoch', MIN(time)) ...`. For a numeric epoch client-side, select `date_part('epoch', time)` explicitly.

## Parameterize user input — always

Never string-concatenate user input into a query — this is a **SQL injection** vector exactly as it would be in any other SQL-speaking database. Every official client supports a parameterized query API; use it. The HTTP API also supports a `params` object on `/api/v3/query_sql`.

| Language | Example reference |
|---|---|
| Python | `references/clients/python.md` → "Parameterized SQL query" |
| JavaScript | `references/clients/javascript.md` → "Parameterized SQL query" |
| Go | `references/clients/go.md` → "Parameterized SQL query" |
| Java | `references/clients/java.md` → "Parameterized SQL query" |
| C# | `references/clients/csharp.md` → "Parameterized SQL query" |
| Raw HTTP | `references/clients/http.md` → "Parameterizing user input" |

## Pagination

Two strategies, depending on shape:

**Time-windowed (preferred for time-series).** Query a fixed window, advance the window boundary, query again.

```sql
SELECT * FROM sensor
WHERE time >= $start AND time < $end
ORDER BY time
LIMIT 1000
```

**LIMIT/OFFSET (for non-time-ordered queries).** Slower for large offsets but works for arbitrary result sets.

```sql
SELECT * FROM sensor
ORDER BY time DESC
LIMIT 1000 OFFSET 5000
```

## Avoid unbounded `SELECT *`

`SELECT * FROM sensor` against a large measurement will return everything — slow and expensive. Include a `WHERE time >= ...` filter or a `LIMIT`. If the developer's query has neither, add one and say that you added it.

## InfluxQL

When the developer asks for InfluxQL, use the `/api/v3/query_influxql` endpoint or the client's InfluxQL mode.

## Query failures on Core and Enterprise 3.12.1

Check the HTTP status before decoding a result as JSON.
A requested result format does not determine the error body's format.

| Observation | Interpretation and action |
|---|---|
| SQL unknown table returns 400 with a plain-text planning error | Check the table and database; fix the query rather than retrying it. |
| InfluxQL unknown table returns 200 with `[]` | An empty InfluxQL result does not prove that the table exists. Empty SQL and InfluxQL JSON results are also `[]`. |
| Admin query against an unknown database returns 404 | Check the database name and provision it through the setup workflow if needed. |
| Scoped Enterprise query returns 403 with an empty body | The tested credential receives the same response for a denied database and a nonexistent database. Check access and visible databases; don't infer existence from the response. |
| Query-memory exhaustion before the first row returns 429; Core 3.12.1 returned 500 | The tested errors were plain text across JSON, JSONL, CSV, pretty, and Parquet requests, without `Retry-After`. Use bounded exponential backoff with jitter for transient resource failures. If repeated, report the resource error and route performance work to the tuning docs. |
| Enterprise data query returns 405 on an ingest-only node | Use an endpoint that runs query mode. Retrying the same data query on the same node does not fix routing. Success of general system-table queries on such a node has not been verified. |

Not every 500 means resource exhaustion.
The [3.12.1 release notes](https://docs.influxdata.com/influxdb3/enterprise/release-notes/#v3121) describe returning the error status before any rows, but a stream can still end early after rows start, so detect incomplete responses.
The live memory-pool probes exercised failures before the first row, not failures partway through a result.

The [3.12.0 notes](https://docs.influxdata.com/influxdb3/enterprise/release-notes/#v3120) also describe a finite query-concurrency limit.
Excess queries wait for a slot, so set a client timeout instead of assuming every overload fails immediately.
Select system-table columns by name rather than parsing `SELECT *` positionally, because release changes can reorder columns.

## Where to fetch more

`references/doc-urls.md` → "SQL reference" or "InfluxQL reference".
