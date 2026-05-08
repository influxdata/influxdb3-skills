# Demo: Silent auto-create misroute

## Symptom

You write data to a database, the call succeeds, you log "Done." But when you query the database name you intended, no rows return. Where did the data go?

## Cause

InfluxDB 3 (default config) silently auto-creates a database on first write. A typo in `INFLUXDB_DATABASE` (or in a hard-coded name in code) becomes a brand-new database with the typo'd name. The intended database keeps growing nothing.

In `broken.py`, the developer intended `sensor_data` but typo'd `senor_data_<ts>`. The write succeeds; the data is in the typo'd database; queries against the intended database return 0 rows.

## Diagnostic step

List the databases visible to your token; check for typo'd siblings:

```bash
influxdb3 show databases --token "$INFLUXDB_TOKEN" --format json | python3 -c "
import json, sys
dbs = [d['iox::database'] for d in json.load(sys.stdin)]
print([d for d in dbs if 'sensor' in d.lower()])
"
```

If you see both `sensor_data` and `senor_data` (or similar), one is the typo.

## Fix

`fixed.py` adds a verify-then-create-if-missing step BEFORE the first write. The intended database name is checked against the live list; if it's missing, it's created explicitly. No silent surprise.

Generated production code should also include this kind of startup check, OR explicit database creation as part of the deployment pipeline.

For deeper recovery (if you've already misrouted production data), see `references/troubleshooting.md` → "Silent auto-create misroute".

## Run

```bash
# .env should have INFLUXDB_HOST and INFLUXDB_TOKEN
python broken.py    # creates senor_data_<ts>; "succeeds"; manual cleanup needed
python fixed.py     # creates admin_test_sensor_data_<ts>; verifies; auto-cleans up
```

> The broken version creates a real `senor_data_<ts>` database that is NOT auto-cleaned. After running it, manually run:
>
> ```bash
> influxdb3 show databases --format json | python3 -c "import json,sys; print([d['iox::database'] for d in json.load(sys.stdin) if 'senor_data_' in d['iox::database']])"
> # Then delete each one with: influxdb3 delete database <name> --token "$INFLUXDB_TOKEN"
> ```
