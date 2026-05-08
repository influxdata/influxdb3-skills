#!/usr/bin/env bash
# BROKEN: probes /ping with HEAD; gets 404 and reports the server as down.
#
# Symptom: monitoring tools / health checks that use HEAD /ping report
# the server as down even when it's healthy. GET /ping works fine.
#
# Quirk reference: quirks.md entry 1.
set -euo pipefail

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"

echo "==> HEAD $INFLUXDB_HOST/ping (broken)"
status=$(curl -sS -I -o /dev/null -w "%{http_code}" "$INFLUXDB_HOST/ping" --max-time 5)
echo "   status: $status"
if [[ "$status" != "200" ]]; then
  echo "   FAIL: server appears down (status $status)"
  exit 1
fi
echo "   server up"
