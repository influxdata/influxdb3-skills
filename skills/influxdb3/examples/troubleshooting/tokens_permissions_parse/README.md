# Demo: `system.tokens.permissions` is a JSON-encoded string

## Symptom

You write a script to find all tokens with read+write on a specific database:

```python
for perm in row["permissions"]:
    if "db:my_db" in perm:
        ...
```

The filter matches every token in your system, or matches based on character coincidence rather than the expected permission semantics.

## Cause

The `permissions` column in `system.tokens` is stored as a **JSON-encoded string** like `'["db:gf_ha:read", "db:gf_ha:write"]'`, not as a native array. Iterating it yields characters of the string, not permission entries.

## Diagnostic step

Inspect the actual type of the column value:

```python
print(type(row["permissions"]))   # <class 'str'>
print(repr(row["permissions"]))   # '["db:gf_ha:read", "db:gf_ha:write"]'
```

If you see a string with backslash-escaped quotes, you need to JSON-parse before iterating.

## Fix

`json.loads()` (Python) or `JSON.parse()` (JS) the column value first; then iterate the resulting list.

```python
import json
perms = json.loads(row["permissions"])  # now a list
for perm in perms:                       # iterate strings, not characters
    if perm.startswith("db:my_db:"):
        ...
```

## Run

```bash
# .env should have INFLUXDB_HOST, INFLUXDB_TOKEN
python broken.py    # filter matches based on character coincidence
python fixed.py     # filter matches actual permission semantics
```

The demo doesn't create or delete any resources — it only reads from `system.tokens`.

## Where to fetch more

- `quirks.md` entry 4 (canonical home for this quirk)
- `references/admin-http-api.md` → "List tokens — use SQL on `system.tokens`"
- `references/tokens.md` → "Permission-string syntax"
