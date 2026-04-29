# Raw HTTP / curl

For any language without a first-class client, or when a developer explicitly wants to skip the client library, use the v3 HTTP API directly.

## Endpoints

| Action | Method | Path | Notes |
|---|---|---|---|
| Health probe / flavor detection | `GET` | `/ping` | See `references/flavor-detection.md` |
| Write line protocol | `POST` | `/api/v3/write_lp?db=$INFLUXDB_DATABASE` | Body is line protocol; one line per point |
| Write line protocol (Cloud Serverless) | `POST` | `/api/v2/write?org=$INFLUXDB_ORG&bucket=$INFLUXDB_DATABASE` | v2-compat write path |
| Query (SQL) | `POST` | `/api/v3/query_sql` | JSON body: `{"db": "...", "q": "..."}` |
| Query (InfluxQL) | `POST` | `/api/v3/query_influxql` | Same shape; legacy compat only |

## Auth

Always: `Authorization: Bearer $INFLUXDB_TOKEN`. Never put the token in the URL.

## Write — minimal example

```bash
curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "sensor,host=server01,region=us-west temperature=72.4,humidity=45.1 $(date +%s)"
```

Expected: HTTP 204 (no content) on success.

## Query — minimal example

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\", \"q\": \"SELECT * FROM sensor ORDER BY time DESC LIMIT 5\"}"
```

Expected: JSON array of rows.

## Error handling

| Status | Meaning | Retriable? |
|---|---|---|
| 200 / 204 | Success | n/a |
| 400 | Bad request — line protocol parse error or invalid SQL | **No** — fix and retry, don't retry blindly |
| 401 | Auth failed — bad/missing token | **No** — fix env var |
| 404 | Database not found | **No** |
| 429 | Rate limited | **Yes** — exponential backoff |
| 5xx | Server side | **Yes** — backoff + retry |

## Parameterizing user input

The v3 SQL query endpoint accepts an optional `params` object — use it. Never string-concatenate user input into the `q` field.

```bash
curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"db\": \"$INFLUXDB_DATABASE\",
    \"q\": \"SELECT * FROM sensor WHERE host = \$1 LIMIT 10\",
    \"params\": [\"server01\"]
  }"
```

## Where to fetch more

`references/doc-urls.md` → "HTTP API (`/api/v3/*`)".
