#!/usr/bin/env bash
# Run the influxdb3 skill's runnable examples against a live InfluxDB 3 instance.
#
#   INFLUXDB_HOST=http://127.0.0.1:8181 INFLUXDB_TOKEN=... PRODUCT=core evals/run-examples.sh
#
# PRODUCT is core or enterprise. The admin lifecycle examples need resource
# tokens, so they run only for enterprise. The examples are copied to a temp
# directory first, so dependency installs don't touch the repo. Tokens are
# redacted from the logs, which go to $OUT (default: a temp directory).
set -euo pipefail

: "${INFLUXDB_HOST:?set INFLUXDB_HOST}"
: "${INFLUXDB_TOKEN:?set INFLUXDB_TOKEN (an admin token)}"
PRODUCT=${PRODUCT:-core}
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work=$(mktemp -d)
OUT=${OUT:-$work/logs}
DB=skills_examples_$$
mkdir -p "$OUT"
cp -R "$repo/skills/influxdb3/examples/." "$work/"
export INFLUXDB_DATABASE=$DB MAVEN_OPTS=${MAVEN_OPTS:---add-opens=java.base/java.nio=ALL-UNNAMED}
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

redact() { TOKEN=$INFLUXDB_TOKEN perl -pe 's/\Q$ENV{TOKEN}\E/<redacted>/g; s/apiv3_[A-Za-z0-9+\/_=-]{12,}/<redacted>/g'; }

database() { # create|delete
	if [[ $1 == create ]]; then
		curl -sS -o /dev/null -w '%{http_code}' -X POST "$INFLUXDB_HOST/api/v3/configure/database" \
			-H "Authorization: Bearer $INFLUXDB_TOKEN" -H 'Content-Type: application/json' --data "{\"db\":\"$DB\"}"
	else
		curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$INFLUXDB_HOST/api/v3/configure/database?db=$DB&hard_delete_at=now" \
			-H "Authorization: Bearer $INFLUXDB_TOKEN"
	fi
}

failures=0
run() { # label dir command...
	local label=$1 dir=$2 rc=0
	shift 2
	(cd "$work/$dir" && "$@") >"$OUT/$label.raw" 2>&1 || rc=$?
	redact <"$OUT/$label.raw" >"$OUT/$label.log"
	rm -f "$OUT/$label.raw"
	if [[ $rc == 0 ]]; then
		printf '%-22s PASS\n' "$label"
	else
		printf '%-22s FAIL (exit %s)\n' "$label" "$rc"
		tail -5 "$OUT/$label.log" | sed 's/^/    /'
		failures=$((failures + 1))
	fi
}

# shellcheck disable=SC2329 # invoked by trap
cleanup() { printf '%-22s HTTP %s\n' "delete $DB" "$(database delete || true)"; }
trap cleanup EXIT

printf '%-22s HTTP %s\n' "create $DB" "$(database create)"

run http http bash hello.sh
run python python uv run --quiet --with influxdb3-python --with python-dotenv --with pandas python hello.py
run python-schema python uv run --quiet --with influxdb3-python --with python-dotenv --with pandas python schema-example.py
run javascript javascript sh -c 'npm install --silent --no-audit --no-fund && node hello.js'
run javascript-schema javascript node schema-example.js
run go go sh -c 'go mod tidy && go run hello.go'
run go-schema go go run -tags=schema schema_example.go
run java java sh -c 'mvn -q compile && mvn -q exec:java -Dexec.mainClass=Hello'
run java-schema java mvn -q exec:java -Dexec.mainClass=SchemaExample
run csharp csharp sh -c 'dotnet restore -v q && dotnet run'
run diagnose diagnose uv run --quiet --with-requirements requirements.txt python diagnose.py

if [[ $PRODUCT == enterprise ]]; then
	run admin-http admin-http bash admin_lifecycle.sh
	run admin-python admin-python uv run --quiet --with-requirements requirements.txt python admin_lifecycle.py
	run admin-javascript admin-javascript sh -c 'npm install --silent --no-audit --no-fund && node admin-lifecycle.js'
	run admin-go admin-go sh -c 'go mod tidy && go run admin_lifecycle.go'
	run admin-java admin-java sh -c 'mvn -q compile && mvn -q exec:java -Dexec.mainClass=AdminLifecycle'
	run admin-csharp admin-csharp sh -c 'dotnet restore -v q && dotnet run'
fi

echo "Logs: $OUT"
exit $((failures > 0))
