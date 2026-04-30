import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const host = process.env.INFLUXDB_HOST;
const token = process.env.INFLUXDB_TOKEN;
const database = process.env.INFLUXDB_DATABASE;

if (!host || !token || !database) {
  throw new Error('INFLUXDB_HOST, INFLUXDB_TOKEN, and INFLUXDB_DATABASE are required');
}

const client = new InfluxDBClient({ host, token, database });

const now = Date.now();
const points = Array.from({ length: 10 }, (_, i) =>
  Point.measurement('sensor')
    .setTag('host', 'server01')
    .setTag('region', 'us-west')
    .setFloatField('temperature', 70 + i * 0.3)
    .setFloatField('humidity', 40 + i * 0.5)
    .setTimestamp(new Date(now - (10 - i) * 60_000))
);

console.log(`==> Writing ${points.length} points to ${database} on ${host}`);
await client.write(points);

console.log('==> Querying last 10 rows back');
const rows = client.query('SELECT * FROM sensor ORDER BY time DESC LIMIT 10', database, { type: 'sql' });
for await (const row of rows) {
  console.log(row);
}

await client.close();
console.log('==> Done');
