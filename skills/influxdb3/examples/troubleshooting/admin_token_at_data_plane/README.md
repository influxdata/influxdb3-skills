# Demo: Admin token at the data plane (anti-pattern)

## Symptom

Customer audits their app and finds that the application's runtime code is using the admin token (with `*:*:*` permissions) to do regular writes. The app works — but a single leak of that token gives an attacker full control of every database.

## Cause

It's the easiest path: the admin token is the first one created (at server bootstrap), so it's already in the customer's secret manager. Application code that "just needs to write" picks it up. Nobody reviews the scope.

## Diagnostic step

Check what permissions the application's token has:

```bash
influxdb3 show tokens --format json --token "$INFLUXDB_TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data:
    perms = json.loads(t.get('permissions', '[]'))
    if any('*:*:*' in p for p in perms):
        print(f'admin-scoped: {t[\"name\"]} ← used by which app?')
"
```

If the token your application uses appears in that list, it's an admin token. That's the symptom.

## Fix

`fixed.py` shows the structure: provision a scoped resource token at deploy time using the admin token, store the SCOPED token as the application's secret, use only the scoped token for runtime writes. The admin token stays in the deploy/CI environment only.

This fix requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud. On Core, every token is an admin token; see `references/tokens.md` → "InfluxDB 3 Core: admin tokens only."

For production rotation see `references/tokens.md` → "Token rotation pattern".

## Run

```bash
# .env should have INFLUXDB_HOST, INFLUXDB_TOKEN (admin), INFLUXDB_DATABASE
python broken.py    # uses admin token for write — works but anti-pattern
python fixed.py     # provisions scoped token, uses it, cleans up
```

The broken version doesn't create any orphan resources; it just uses the admin token. The fixed version creates and cleans up an `admin_test_app_token_<ts>`.

## Where to fetch more

- `references/tokens.md` → "Adversarial scenarios — what NOT to do"
- `references/troubleshooting.md` → "Auth failures"
