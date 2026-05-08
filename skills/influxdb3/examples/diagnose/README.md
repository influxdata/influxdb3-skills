# Diagnostic toolkit

`diagnose.py` runs a one-page health check on your InfluxDB 3 instance. Useful when something feels off and you want a sanity check before pasting an error into Claude.

## What it does

1. `HEAD /ping` — expecting 404 (a known quirk; only GET works on `/ping`). Verifies network reachability.
2. `GET /ping` — expecting 200. Reports flavor (Core/Enterprise/Cloud) and version.
3. List databases visible to the token. Reports count + first 5 names.
4. (Admin-scope only) Create a throwaway `diagnose_<ts>` database, write a smoke point, query it back, delete the database. Confirms the write subsystem and full round-trip work.

If the token lacks admin scope, step 4 is skipped and the report says "diagnostic limited to read-side."

Cleanup is trapped: if anything fails mid-script, the throwaway DB still gets deleted.

## Run it

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit
python diagnose.py
```

## Output

```
InfluxDB 3 diagnostic — health report
==================================================
host: http://localhost:8181

[1] HEAD /ping (expecting 404 — known quirk; only GET works)
    status: 404 (expected — see references/quirks.md entry 1)

[2] GET /ping (expecting 200)
    status: 200
    flavor: Enterprise
    version: 3.8.4

[3] List databases visible to token
    count: 52
    first 5: ['1hr-retention', '2hr-retention', 'Acme-DB', ...]

[4] Write+query smoke (creating throwaway DB diagnose_1778211000)
    write: HTTP 204
    query count: 1
    cleanup: deleted diagnose_1778211000

Done. (Full health: OK)
```

## Where to fetch more

- `references/troubleshooting.md` for symptom→fix lookups
- `references/quirks.md` for non-obvious behaviors
