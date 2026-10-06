# Querying InfluxDB 3

## SQL is the default

InfluxDB 3's primary query language is SQL (Apache DataFusion under the hood). When in doubt, generate SQL. Reach for InfluxQL **only** when the developer is on v1/v2 compatibility for legacy reasons — flag it as a smell otherwise.

Flux is **not** supported in v3 — if a developer brings Flux code, route them to the migration roadmap (deferred to v1.2).

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

`SELECT * FROM sensor` against a large measurement will return everything — slow and expensive. Always include a `WHERE time >= ...` filter or a `LIMIT`. The skill should add one even if the developer didn't, and call it out.

## Query errors to handle

| Status | Meaning | What to do |
|---|---|---|
| 400 | SQL or planning error, such as an unknown table or column | Fix the query. Don't retry. |
| 401 / 403 | Token missing, invalid, or lacking `read` on the database | Fix the token. Don't retry. |
| 405 | InfluxDB 3 Enterprise 3.12+: the node doesn't run `query` mode, so it refuses data queries (system table queries still work) | Send queries to a node that runs `query` mode. Don't retry on the same node. |
| 429 | InfluxDB 3 Enterprise 3.12+: the query node ran out of its memory or file cache budget and failed this query instead of the whole node running out of memory. The docs name the message `file access cache budget exhausted` and say HTTP returns `429` and Flight returns `RESOURCE_EXHAUSTED`. <!-- known-issue: core-resources-exhausted-500 -->On InfluxDB 3 Core 3.12, the same failure returns `500` with a message that says resources are exhausted; handle it like a 429.<!-- /known-issue --> | Retry after a delay with exponential backoff and jitter, and cap the retries. If it keeps failing, narrow the time range, select fewer columns, or add a `LIMIT`. |
| Other 5xx | Server-side error | Retry with backoff. |

Starting in 3.12, Core and Enterprise limit concurrent queries by default (`--max-concurrent-queries`).
Queries over the limit wait for a slot instead of failing, so set a client-side timeout on each query.

Starting in 3.12 (DataFusion 52.5), `pow()` and `power()` with integer arguments return a float.
`system.nodes` and `system.tables` gained columns before their existing ones, so select system table columns by name, not with `SELECT *` and positional parsing.

## InfluxQL — only when forced

If the developer asks for InfluxQL on a fresh project, push back: "v3 SQL is the recommended query language. InfluxQL is supported for v1/v2 compatibility but lacks some v3 features. Are you sure?" If they confirm, use the `/api/v3/query_influxql` endpoint or the client's InfluxQL mode.

## Where to fetch more

`references/doc-urls.md` → "SQL reference" or "InfluxQL reference".
