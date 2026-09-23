# JavaScript / TypeScript Client (`@influxdata/influxdb3-client`)

## Install

```bash
npm install @influxdata/influxdb3-client dotenv
```

## Construct the client

```javascript
import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST,
  token: process.env.INFLUXDB_TOKEN,
  database: process.env.INFLUXDB_DATABASE,
});
```

## Write a batch

```javascript
const points = Array.from({ length: 1000 }, () =>
  Point.measurement('sensor')
    .setTag('host', 'server01')
    .setTag('region', 'us-west')
    .setFloatField('temperature', 72.4)
    .setFloatField('humidity', 45.1)
);
await client.write(points);
```

Default rule: batch ≥ 1,000 points or flush every 1 second.

> **InfluxDB Cloud Serverless:** writes go to the v2-compatibility endpoint `/api/v2/write` (not `/api/v3/write_lp` as in Core / Enterprise / Cloud Dedicated). `@influxdata/influxdb3-client` 2.3.0 and later writes through `/api/v2/write` by default for every product, so one invalid line rejects the whole batch. For partial writes or `noSync` on InfluxDB 3 Core or Enterprise, set `useV2Api: false`. If you drop down to raw HTTP for InfluxDB Cloud Serverless, you need the v2 path and the `INFLUXDB_ORG` env var. See `references/writing.md` → "Official clients write through `/api/v2/write` by default". See `references/flavors.md` for the full per-flavor matrix and `references/clients/http.md` for the raw-HTTP shapes.

## Parameterized SQL query

```javascript
const rows = client.query(
  'SELECT * FROM sensor WHERE host = $host LIMIT 10',
  process.env.INFLUXDB_DATABASE,
  { type: 'sql', params: { host: userSuppliedHost } }
);
for await (const row of rows) {
  console.log(row);
}
```

## Error handling

Catch and inspect `error.statusCode`. Treat 429 / 5xx as retriable; 400 / 401 / 404 as non-retriable.

## Where to fetch more

`references/doc-urls.md` → "JavaScript / TypeScript".
