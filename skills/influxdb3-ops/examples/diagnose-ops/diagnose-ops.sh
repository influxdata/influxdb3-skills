#!/usr/bin/env bash
#
# Read-only ops diagnostic collector for InfluxDB 3.
#
# Collects a one-page operator health report:
#   [1] /ping            — status, flavor, version
#   [2] /metrics health  — key operator Prometheus series
#   [3] Local disk        — du/df of the data dir (if known)
#   [4] Logs             — per-deployment guidance to fetch logs
#   [5] Node & license   — system.nodes / system.license
#   [6] Recent compaction — system.compaction_events
#   [7] Slowest queries  — system.queries
#   [8] Biggest tables   — system.parquet_files
#
# READ-ONLY: only GET /ping, GET /metrics, read-only SELECT queries, and local df/du.
# It never mutates server state.
#
# TOKEN-SAFE: the token is never echoed. All output passes through a final
# redaction net that replaces any apiv3_ token with <redacted>.
#
set -euo pipefail

# ----------------------------------------------------------------------------
# Load env: source a .env next to this script if present.
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

HOST="${INFLUXDB_HOST:-}"
TOKEN="${INFLUXDB_TOKEN:-}"
DB="${INFLUXDB_DATABASE:-_internal}"
DATA_DIR="${INFLUXDB_DATA_DIR:-}"
CLI="${INFLUXDB3_CLI:-influxdb3}"

if [[ -z "${HOST}" || -z "${TOKEN}" ]]; then
  echo "FAIL: INFLUXDB_HOST and INFLUXDB_TOKEN must be set (in .env next to this script or in env)" >&2
  exit 1
fi

# Auth header for curl — built into a variable; never echoed.
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

# The CLI reads its token from this env var.
export INFLUXDB3_AUTH_TOKEN="${TOKEN}"

# ----------------------------------------------------------------------------
# Collect the whole report into a variable, then redact on the way out.
# A helper runs each query under `set +e` so a single failure never aborts.
# ----------------------------------------------------------------------------

run_query() {
  # $1 = SQL ; prints rows or a short "skipped/failed" line.
  local sql="$1"
  local out
  if out="$("${CLI}" query --database "${DB}" --host "${HOST}" "${sql}" 2>&1)"; then
    printf '%s\n' "${out}"
  else
    printf '  skipped/failed: %s\n' "$(printf '%s' "${out}" | head -n 2 | tr '\n' ' ')"
  fi
}

generate_report() {
  echo "InfluxDB 3 ops diagnostic — read-only health report"
  echo "=================================================="
  echo "host:     ${HOST}"
  echo "database: ${DB}"
  echo

  # --- [1] /ping ----------------------------------------------------------
  echo "[1] /ping"
  local ping_headers ping_status flavor version
  if ping_headers="$(curl -sS -D - -o /dev/null -H "${AUTH_HEADER}" "${HOST}/ping" 2>&1)"; then
    ping_status="$(printf '%s' "${ping_headers}" | awk 'NR==1{print $2}')"
    flavor="$(printf '%s' "${ping_headers}" | awk -F': ' 'tolower($1)=="x-influxdb-build"{print $2}' | tr -d '\r')"
    version="$(printf '%s' "${ping_headers}" | awk -F': ' 'tolower($1)=="x-influxdb-version"{print $2}' | tr -d '\r')"
    echo "    status:  ${ping_status:-<unknown>}"
    echo "    flavor:  ${flavor:-<missing>}"
    echo "    version: ${version:-<missing>}"
  else
    echo "    FAIL: could not reach ${HOST}/ping"
  fi
  echo

  # --- [2] /metrics health ------------------------------------------------
  echo "[2] /metrics health (key operator series)"
  local metrics_status metrics_body
  metrics_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "${AUTH_HEADER}" "${HOST}/metrics" 2>/dev/null || echo "000")"
  if [[ "${metrics_status}" == "401" ]]; then
    echo "    metrics need a valid admin token (got HTTP 401)"
  elif [[ "${metrics_status}" != "200" ]]; then
    echo "    skipped/failed: /metrics returned HTTP ${metrics_status}"
  else
    metrics_body="$(curl -sS -H "${AUTH_HEADER}" "${HOST}/metrics" 2>/dev/null || true)"
    # Surface the key series. Drop comment lines and the per-bucket histogram
    # rows (object_store_op_duration_seconds_bucket) so the report stays one
    # page; the _sum/_count summary lines for that histogram are kept.
    printf '%s\n' "${metrics_body}" \
      | grep -E 'datafusion_mem_pool_bytes|query_datafusion_query_execution_ooms_total|jemalloc_memstats_bytes|http_requests_total|grpc_requests_total|influxdb3_compaction_sequence_number|influxdb3_parquet_cache_size_bytes|object_store_op_duration_seconds|object_store_transfer_bytes_total|tokio_watchdog_hangs_total|thread_panic_count_total|process_start_time_seconds' \
      | grep -v '^#' \
      | grep -vE 'object_store_op_duration_seconds_bucket' \
      | sed 's/^/    /' || echo "    (no matching metric series found)"
  fi
  echo

  # --- [3] Local disk -----------------------------------------------------
  echo "[3] Local disk"
  if [[ -n "${DATA_DIR}" && -d "${DATA_DIR}" ]]; then
    echo "    data dir: ${DATA_DIR}"
    du -sh "${DATA_DIR}" 2>&1 | sed 's/^/    du:  /' || echo "    du failed"
    df -h "${DATA_DIR}" 2>&1 | sed 's/^/    df:  /' || echo "    df failed"
  else
    echo "    skipped (set INFLUXDB_DATA_DIR to a local file-object-store data dir)"
  fi
  echo

  # --- [4] Logs -----------------------------------------------------------
  echo "[4] Logs (cannot read another process's logs portably — fetch them with):"
  echo "    Docker:     docker logs <container>"
  echo "    systemd:    journalctl -u influxdb3 -n 200 --no-pager"
  echo "    foreground: the process stdout/stderr where you launched influxdb3"
  echo

  # --- [5] Node & license -------------------------------------------------
  echo "[5] Node & license"
  echo "  system.nodes:"
  run_query "SELECT node_id, mode, core_count, state FROM system.nodes" | sed 's/^/  /'
  echo "  system.license:"
  run_query "SELECT license_type, licensed_cores, available_cores, expires_at FROM system.license" | sed 's/^/  /'
  echo

  # --- [6] Recent compaction ----------------------------------------------
  echo "[6] Recent compaction (system.compaction_events)"
  run_query "SELECT event_time, event_type, event_status, event_duration FROM system.compaction_events ORDER BY event_time DESC LIMIT 10" | sed 's/^/  /'
  echo

  # --- [7] Slowest recent queries -----------------------------------------
  echo "[7] Slowest recent queries (system.queries)"
  run_query "SELECT query_text, end2end_duration, max_memory, success FROM system.queries WHERE running = false ORDER BY end2end_duration DESC LIMIT 10" | sed 's/^/  /'
  echo

  # --- [8] Biggest tables -------------------------------------------------
  echo "[8] Biggest tables (system.parquet_files)"
  run_query "SELECT table_name, sum(size_bytes) AS bytes, sum(row_count) AS rows FROM system.parquet_files GROUP BY table_name ORDER BY bytes DESC LIMIT 15" | sed 's/^/  /'
  echo

  echo "Done. (read-only)"
}

# ----------------------------------------------------------------------------
# FINAL REDACTION SAFETY NET: never let an apiv3_ token reach stdout, even if
# one appears inside a query_text, error message, or header.
# ----------------------------------------------------------------------------
generate_report 2>&1 | sed -E 's/apiv3_[A-Za-z0-9_-]{20,}/<redacted>/g'
