#!/usr/bin/env bash
# BROKEN: probes /ping with HEAD; gets 404 and reports the server as down.
#
# Symptom: monitoring tools / health checks that use HEAD /ping report
# the server as down even when it's healthy. GET /ping works fine.
#
# Quirk reference: quirks.md entry 1.
set -euo pipefail

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required}"   # /ping needs a token by default (quirks.md entry 1)

# Token is sent so the only difference from fixed.sh is the HTTP method:
# HEAD /ping returns 404 (the quirk), GET /ping returns 200. Without the token,
# an unauthenticated probe would return 401 and mask the quirk.
echo "==> HEAD $INFLUXDB_HOST/ping (broken)"
status=$(curl -sS -I -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $INFLUXDB_TOKEN" "$INFLUXDB_HOST/ping" --max-time 5)
echo "   status: $status"
if [[ "$status" != "200" ]]; then
  echo "   FAIL: server appears down (status $status)"
  exit 1
fi
echo "   server up"
