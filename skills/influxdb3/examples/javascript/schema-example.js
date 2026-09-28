import 'dotenv/config';
import { InfluxDBClient, Point } from '@influxdata/influxdb3-client';

const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST,
  token: process.env.INFLUXDB_TOKEN,
  database: process.env.INFLUXDB_DATABASE,
});

const now = Date.now();
const points = [];
for (let minute = 0; minute < 60; minute++) {
  const ts = new Date(now - (60 - minute) * 60_000);
  for (const region of ['us-west', 'us-east']) {
    for (let hostIdx = 0; hostIdx < 3; hostIdx++) {
      points.push(
        Point.measurement('sensor')
          .setTag('host', `server${String(hostIdx).padStart(2, '0')}`)
          .setTag('region', region)
          .setFloatField('temperature', 70 + (minute % 5))
          .setFloatField('humidity', 40 + (hostIdx % 3))
          .setTimestamp(ts)
      );
    }
  }
}
console.log(`==> Writing ${points.length} points`);
await client.write(points);

console.log('==> Avg temperature per region per 5-min bucket, last hour');
const sql = `
  SELECT
    region,
    DATE_BIN(INTERVAL '5 minutes', time) AS bucket,
    AVG(temperature) AS avg_temp
  FROM sensor
  WHERE time >= now() - INTERVAL '1 hour'
  GROUP BY region, bucket
  ORDER BY bucket DESC, region
`;
const rows = client.query(sql, process.env.INFLUXDB_DATABASE, { type: 'sql' });
for await (const row of rows) {
  console.log(row);
}
await client.close();
