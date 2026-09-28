# Admin lifecycle — Python

`admin_lifecycle.py` exercises the full token + database lifecycle for InfluxDB 3 **Enterprise**, using `requests` to hit the management HTTP API directly. The official `influxdb3-python` client is data-plane only — it doesn't expose admin operations.

> **Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud.** `_create_scoped_token` creates a scoped resource token via `/api/v3/enterprise/configure/token`. Core has no resource tokens, so it doesn't run on Core (`references/tokens.md`).

## What it does

The same 10-step lifecycle as `examples/admin-http/admin_lifecycle.sh` (list → create DB → create scoped token → write a point → list/filter via SQL → rotate → delete original → delete DB → delete rotated → orphan check). Cleanup runs in a `try/finally` block; partial failures still revoke whatever was created.

## Run it

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit
python admin_lifecycle.py
```

> The token created at step 3 is real. Its plaintext value is held only in a local variable and used immediately; never logged or persisted.

## Adapting for production

- Don't copy this script into production CI without changing the test-DB name pattern (`admin_test_python_<ts>`).
- Generalize the `try/finally` cleanup pattern into your real provisioning code.

## Where to fetch more

`references/admin-http-api.md` for endpoint details; `references/tokens.md` for permission-string syntax and rotation pattern.
