#!/usr/bin/env bash
# Admin lifecycle example for InfluxDB 3 Enterprise via HTTP/curl.
#
# Exercises a full token + database lifecycle:
#   1. list DBs    2. create test DB    3. create scoped token
#   4. write point with scoped token    5. list tokens (SQL on system.tokens)
#   6. rotate (create second token)     7. verify + delete first
#   8. delete DB                        9. delete rotated token
#   10. final orphan check
#
# Reads INFLUXDB_HOST and INFLUXDB_TOKEN (admin) from env.
# Generates the test DB name at runtime so multiple runs don't collide.
#
# Note: requires Enterprise or Cloud — it creates scoped resource tokens via
# /api/v3/enterprise/configure/token. It does NOT run on Core: Core has no
# resource tokens (POST /api/v3/configure/token returns 404), so step 3 fails.
# Database CRUD and delete-token endpoints are identical across Core and Enterprise.
set -euo pipefail

# Trust boundary: INFLUXDB_HOST and this auto-sourced .env decide where the
# ADMIN token is sent. Every request below (including the trap-based cleanup
# DELETEs, which fire even on Ctrl-C) attaches `Authorization: Bearer
# $INFLUXDB_TOKEN` to "$INFLUXDB_HOST/..." with no host validation — a poisoned
# env or a hostile .env in this directory would exfiltrate an admin token. Only
# run against a host you control; don't source a .env you didn't write.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$script_dir/.env" ]] && { set -a; source "$script_dir/.env"; set +a; }

: "${INFLUXDB_HOST:?INFLUXDB_HOST is required}"
: "${INFLUXDB_TOKEN:?INFLUXDB_TOKEN is required (must be an admin token)}"

TS=$(date +%s)
TEST_DB="admin_test_http_$TS"
TOKEN_A="admin_test_http_token_${TS}_a"
TOKEN_B="admin_test_http_token_${TS}_b"

# Trap-based cleanup — runs even on partial failure.
cleanup() {
  local rc=$?
  echo
  echo "==> cleanup (exit $rc)"
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?token_name=$TOKEN_A" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete token A: HTTP %{http_code}\n" || true
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?token_name=$TOKEN_B" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete token B: HTTP %{http_code}\n" || true
  curl -sS -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$TEST_DB" \
    -H "Authorization: Bearer $INFLUXDB_TOKEN" -o /dev/null -w "  delete DB: HTTP %{http_code}\n" || true
  echo "==> cleanup done"
  exit $rc
}
trap cleanup EXIT

curl_admin() { curl -sS -H "Authorization: Bearer $INFLUXDB_TOKEN" "$@"; }

echo "==> step 1: list databases (sanity check)"
curl_admin "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  | python3 -c "import json,sys; print('  ', len(json.load(sys.stdin)), 'databases')"

echo "==> step 2: create $TEST_DB"
curl_admin -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"$TEST_DB\"}" -w "  HTTP %{http_code}\n" -o /dev/null

echo "==> step 3: create scoped token A for $TEST_DB"
SCOPED_A=$(curl_admin -X POST "$INFLUXDB_HOST/api/v3/enterprise/configure/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"resource\",
    \"token_name\": \"$TOKEN_A\",
    \"permissions\": [
      {\"resource_type\": \"db\", \"resource_names\": [\"$TEST_DB\"], \"actions\": [\"read\", \"write\"]}
    ]
  }" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('token', ''))")
[[ -n "$SCOPED_A" ]] || { echo "  FAILED: no token returned"; exit 1; }
echo "  ok (secret captured, length ${#SCOPED_A})"

echo "==> step 4: write a point using token A"
NOW=$(date +%s)
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$TEST_DB&precision=second" \
  -H "Authorization: Bearer $SCOPED_A" \
  --data-binary "lifecycle_test,host=h1 value=1.0 $NOW" -w "  HTTP %{http_code}\n" -o /dev/null

echo "==> step 5: list tokens via SQL, find $TOKEN_A"
# Bind the name as a $name parameter (named object, not string-concatenated into q).
curl_admin -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Content-Type: application/json" \
  -d "{\"db\": \"_internal\", \"q\": \"SELECT name FROM system.tokens WHERE name = \$name\", \"params\": {\"name\": \"$TOKEN_A\"}}" \
  | python3 -c "
import json, sys
rows = json.load(sys.stdin)
print('  found:', len([r for r in rows if r.get('name') == '$TOKEN_A']))
"

echo "==> step 6: rotate — create scoped token B for $TEST_DB"
SCOPED_B=$(curl_admin -X POST "$INFLUXDB_HOST/api/v3/enterprise/configure/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"resource\",
    \"token_name\": \"$TOKEN_B\",
    \"permissions\": [
      {\"resource_type\": \"db\", \"resource_names\": [\"$TEST_DB\"], \"actions\": [\"read\", \"write\"]}
    ]
  }" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('token', ''))")
[[ -n "$SCOPED_B" ]] || { echo "  FAILED: no token returned"; exit 1; }
echo "  ok"

echo "==> step 7: verify B works, delete A"
curl -sS -X POST "$INFLUXDB_HOST/api/v3/write_lp?db=$TEST_DB&precision=second" \
  -H "Authorization: Bearer $SCOPED_B" \
  --data-binary "lifecycle_test,host=h1 value=2.0 $((NOW+1))" -w "  write with B: HTTP %{http_code}\n" -o /dev/null
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?token_name=$TOKEN_A" \
  -w "  delete A: HTTP %{http_code}\n" -o /dev/null
TOKEN_A=""  # mark as already-deleted so the trap doesn't double-delete

echo "==> step 8: delete $TEST_DB"
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$TEST_DB" \
  -w "  HTTP %{http_code}\n" -o /dev/null
TEST_DB=""

echo "==> step 9: delete token B"
curl_admin -X DELETE "$INFLUXDB_HOST/api/v3/configure/token?token_name=$TOKEN_B" \
  -w "  HTTP %{http_code}\n" -o /dev/null
TOKEN_B=""

echo "==> step 10: orphan check"
ORPHANS_DB=$(curl_admin "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  | python3 -c "
import json, sys
dbs = [d['iox::database'] for d in json.load(sys.stdin)]
print('|'.join(d for d in dbs if d.startswith('admin_test_http_')))
")
ORPHANS_TOK=$(curl_admin -X POST "$INFLUXDB_HOST/api/v3/query_sql" \
  -H "Content-Type: application/json" \
  -d '{"db": "_internal", "q": "SELECT name FROM system.tokens WHERE name LIKE '\''admin_test_http_%'\''"}' \
  | python3 -c "
import json, sys
rows = json.load(sys.stdin)
print('|'.join(r['name'] for r in rows if r.get('name', '').startswith('admin_test_http_')))
")
echo "  database orphans: ${ORPHANS_DB:-<none>}"
echo "  token orphans:    ${ORPHANS_TOK:-<none>}"
[[ -z "$ORPHANS_DB" && -z "$ORPHANS_TOK" ]] || { echo "  FAILED: orphans found"; exit 1; }

trap - EXIT  # success path — disarm the trap
echo "==> Done. Lifecycle completed cleanly."
