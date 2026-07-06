# Plugin Code Safety

Processing Engine plugins are **not sandboxed**. A trigger runs your Python
with the full privileges of the InfluxDB 3 server process: same OS user, same
filesystem access, same network access, and the ability to read the server's
own configuration and token files. Deploying a plugin therefore requires an
admin token, and a deployed plugin is effectively arbitrary code execution
inside the server. Generated plugin code has to be held to that standard.

These rules are about the code Claude *writes into a plugin*, not about the
server's deploy-time permission checks (which are covered in
`references/installing.md`).

## 1. No dynamic execution of untrusted data

Do not generate plugin code that hands attacker-influenceable input to a code
or deserialization sink:

- No `eval`, `exec`, `compile`, or `__import__` on request/query/log-derived
  strings.
- No `subprocess`, `os.system`, `os.popen`, or `shell=True` built from such
  input — and avoid shelling out at all unless the plugin genuinely needs it.
- No `pickle.loads`, `yaml.load` (use `yaml.safe_load`), or `marshal.loads` on
  request bodies, cache values that crossed a trust boundary, or query results.

Request bodies (`request_body`), query parameters (`query_parameters`), request
headers, tag/field values, and anything read back with `query()` are **data,
never code**. Parse them with `json.loads` and validate; never execute them.

## 2. Parameterize `query()` — never build SQL from request input

`process_request` plugins receive `query_parameters`, `request_headers`, and
`request_body` straight from the network. Concatenating any of them into a SQL
string is injectable exactly as it is in external application code.

```python
# UNSAFE — request input concatenated into SQL
def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):
    host = query_parameters.get("host", "")
    rows = influxdb3_local.query(f"SELECT * FROM cpu WHERE host = '{host}'")  # injectable
    return {"rows": rows}, 200

# SAFE — bind the value with args=
def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):
    host = query_parameters.get("host", "")
    rows = influxdb3_local.query(
        "SELECT * FROM cpu WHERE host = $host",
        args={"host": host},
    )
    return {"rows": rows}, 200
```

The `query(sql, args=None)` binding path (`references/runtime-api.md`) is the
same parameterization the sibling `influxdb3` skill requires for external
queries. Use it for any value that originated outside the plugin.

## 3. Never read, log, or return secrets

The plugin can read the server's token and config files off disk, but generated
code has no reason to. Specifically:

- Do not read token/credential files, `printenv`-style dumps of the process
  environment, or `INFLUXDB3_*` auth variables and place them anywhere they can
  leave the process.
- Do not pass secrets to `influxdb3_local.info/warn/error` — log output lands in
  `system.processing_engine_logs`, which is queryable by anyone who can read
  that table.
- Do not return secrets (or full environment / config) in a `process_request`
  response body.

If a plugin needs a credential for an outbound call, take it from an explicit
trigger argument (`args`) the operator sets, not by scraping the server's own
environment.

## 4. Treat `query()` results and cache values as untrusted

Rows returned by `query()` include user-written tag and field values, token
names, and log text — all attacker-influenceable. Global-cache values
(`use_global=True`) may have been written by a different trigger. Validate and
type-check before acting on them; never feed them into the sinks in §1.

## 5. Review third-party plugin code before deploying it

`--path "gh:..."`, `--plugin-repo`, and `influxdb3 install package` all pull
code that then runs unsandboxed (see `references/installing.md`). Read it first;
the rules above apply to code you deploy as much as code you write.
