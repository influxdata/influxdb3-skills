#!/usr/bin/env bash
# FIXED: probes /ping with GET (the supported method).
#
# Quirk reference: quirks.md entry 1.
set -euo pipefail

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required}"

echo "==> GET $INFLUXDB_HOST/ping"
response=$(curl -sS -i -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/ping" --max-time 5)
status=$(echo "$response" | head -1 | awk '{print $2}')
flavor=$(echo "$response" | grep -i "^x-influxdb-build:" | awk '{print $2}' | tr -d '\r')
version=$(echo "$response" | grep -i "^x-influxdb-version:" | awk '{print $2}' | tr -d '\r')
echo "   status: $status"
echo "   flavor: ${flavor:-<missing>}"
echo "   version: ${version:-<missing>}"
if [[ "$status" != "200" ]]; then
  echo "   FAIL"
  exit 1
fi
echo "   server up (and HEAD-on-ping returning 404 is a known quirk; only GET works)"
