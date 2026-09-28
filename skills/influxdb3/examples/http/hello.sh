#!/usr/bin/env bash
set -euo pipefail

# Hello-world for InfluxDB 3 over raw HTTP / curl.
# Connects, writes 10 points, queries them back.

# Load .env from the script's directory if present.
# Trust boundary: INFLUXDB_HOST and this auto-sourced .env decide where the
# bearer token below is sent. A poisoned env var or a hostile .env dropped in
# this directory would ship the token to an attacker's host — the requests
# carry `Authorization: Bearer $INFLUXDB_TOKEN` with no host validation. Only
# run this against a host you control, and don't source a .env you didn't write.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$script_dir/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$script_dir/.env"
  set +a
fi

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required}"
: "${INFLUXDB_DATABASE:?INFLUXDB_DATABASE is required}"

echo "==> Writing 10 points to $INFLUXDB_DATABASE on $INFLUXDB_HOST"

now=$(date +%s)
body=""
for i in $(seq 1 10); do
  ts=$((now - (10 - i) * 60))
  body+="sensor,host=server01,region=us-west temperature=$((70 + RANDOM % 5)).0,humidity=$((40 + RANDOM % 10)).0 $ts"$'\n'
done

curl -sS -X POST \
  "$INFLUXDB_HOST/api/v3/write_lp?db=$INFLUXDB_DATABASE&precision=second" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  --data-binary "$body"

echo "==> Querying last 10 rows back"

curl -sS -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$INFLUXDB_DATABASE\", \"q\": \"SELECT * FROM sensor ORDER BY time DESC LIMIT 10\"}"
echo
echo "==> Done"
