# Plugin troubleshooting

This file maps plugin symptoms to causes.
For the debugging workflow (offline test, log queries, update trigger), see [`references/testing.md`](testing.md).

## Symptom → section

| Symptom | Section |
|---|---|
| Trigger created but never fires | [Trigger doesn't fire](#trigger-doesnt-fire) |
| Plugin logs show ImportError | [Dependencies](#dependencies) |
| Trigger fails but no error appears in the logs table | [Plugin errors](#plugin-errors-in-systemprocessing_engine_logs) |
| `'dict' object has no attribute 'rows'` | [`AttributeError: 'dict' object has no attribute 'rows'`](#attributeerror-dict-object-has-no-attribute-rows) |
| `Schema error: No field named plugin_name` (or similar) on `system.processing_engine_logs` | [`references/testing.md` → "Reading plugin logs"](testing.md#reading-plugin-logs) |
| Cache values disappeared / counter reset | [Cache lifecycle gotchas](#cache-lifecycle-gotchas) |
| Plugin runs but writes don't show up | `influxdb3` skill → [`references/troubleshooting.md` → "Silent auto-create misroute"](../../influxdb3/references/troubleshooting.md#silent-auto-create-misroute) |
| Plugin only fires on some writes (clustered) | Not covered; see the scope note in [Trigger doesn't fire](#trigger-doesnt-fire) |

## Trigger doesn't fire

These steps assume a single-node deployment, which needs no placement: every write reaches the one node that runs the trigger. Multi-node placement isn't covered; link https://docs.influxdata.com/influxdb3/enterprise/plugins/ and don't describe placement.

**Diagnose (in order):**

1. **Is the engine enabled?** The server must have been started with `--plugin-dir` (or `INFLUXDB3_PLUGIN_DIR`). Verify:

   ```bash
   influxdb3 show plugins --token "$INFLUXDB_ADMIN_TOKEN"
   ```

   If the command fails, check that the server started with `--plugin-dir`. Restart the server with `--plugin-dir <path>` and try again.

2. **Is the trigger registered?**

   ```bash
   influxdb3 query -d _internal --token "$INFLUXDB_ADMIN_TOKEN" \
     "SELECT trigger_name, plugin_filename, trigger_specification, disabled
      FROM system.processing_engine_triggers
      WHERE trigger_name = '<your_trigger_name>'"
   ```

   If the row isn't there, check the `create trigger` output and the database name, then re-create the trigger.

3. **Is the trigger spec what you think it is?**
   - WAL trigger spec `table:my_table` only fires on writes to `my_table`. `all_tables` fires on any. Mismatched spec = silent no-fire.
   - Scheduled trigger spec `every:30s` fires every 30 seconds (allow 30s + a few seconds slack); `cron:0 0 0 * * *` is daily at midnight UTC. Check numeric day-of-week values: `1` is Sunday, so prefer names such as `MON-FRI`. See [`references/trigger-types.md`](trigger-types.md) for the cron format.
   - Request trigger spec `request:foo` exposes the endpoint at `/api/v3/engine/foo`. Hit that URL specifically; `request:bar` ≠ `request:foo`.

4. **Is the trigger disabled?** The `disabled` column in step 2 will tell you. Enable it:

   ```bash
   influxdb3 enable trigger --database "$INFLUXDB_DATABASE" --token "$INFLUXDB_ADMIN_TOKEN" <your_trigger_name>
   ```

**Fix:** correct whichever of 1–4 is wrong.

## Plugin errors in `system.processing_engine_logs`

Query the trigger's database for that trigger's logs, or `_internal` for logs from every trigger. For the columns, including `time` versus `event_time` by version, see [`testing.md`](testing.md#reading-plugin-logs). (`plugin_name`, `level`, and `message` aren't columns.)

```bash
influxdb3 query -d "$INFLUXDB_DATABASE" --token "$INFLUXDB_TOKEN" \
  "SELECT event_time, log_level, log_text FROM system.processing_engine_logs
   WHERE trigger_name = '<your_trigger_name>'
   ORDER BY event_time DESC LIMIT 50"
```

**Common error patterns:**

**Check the server log for uncaught exceptions.**
An uncaught Python exception might not appear in this table, so an empty query doesn't prove the plugin succeeded.
The server log shows the exception type and message on an `ERROR influxdb3_processing_engine::scheduler: trigger execution failed` line, without a Python traceback.
A request trigger also returns the error in its HTTP 500 body.
On a multi-node cluster, check the server log on every node that runs the trigger.

### `AttributeError: 'dict' object has no attribute 'rows'`

WAL plugin code accessing `batch.rows`. `table_batches` items are plain dicts ([`references/runtime-api.md`](runtime-api.md#table_batches-shape-wal-plugins-only)). Fix with `batch["rows"]` and `batch["table_name"]`. Broken and fixed pair: `examples/troubleshooting/table_batches_attr_access/`.

### `ImportError: No module named '<pkg>'`

Plugin needs a Python package that isn't in the embedded venv. See [Dependencies](#dependencies).

### `NameError: name 'LineBuilder' is not defined`

`LineBuilder` is a runtime global that exists only inside the engine. This error usually means the code ran outside the engine or a local name shadows it. Don't import it. See [`runtime-api.md`](runtime-api.md).

### `QueryError: ...`

Most often a SQL typo or schema mismatch — see the main skill's [`troubleshooting.md` → "Query failures"](../../influxdb3/references/troubleshooting.md#query-failures).

### Generic Python tracebacks

`influxdb3 update trigger --path <local-path>` to push a fix without re-creating the trigger. The iteration loop is documented in [`references/testing.md` → "Live trigger iteration loop"](testing.md#live-trigger-iteration-loop).

## Dependencies

### `ImportError` for a package you installed

**Diagnose:** Did you install with `influxdb3 install package` (correct) or `pip install` against the host's Python (wrong)? Plugins see only the embedded venv ([`references/dependencies.md`](dependencies.md#the-embedded-venv-rule-most-important)).

```bash
# Verify the package is in the embedded venv
ls <PLUGIN_DIR>/.venv/lib/python*/site-packages/ | grep <pkg>
```

If absent: the package isn't in the right venv. Re-install with:

```bash
influxdb3 install package <pkg> --token "$INFLUXDB_ADMIN_TOKEN"
```

For the HTTP API and version pinning, see [`references/dependencies.md`](dependencies.md).

### `ImportError` after a server restart

The server reuses an existing venv and its packages at startup. The venv is `<PLUGIN_DIR>/.venv`, or the path given by `--virtual-env-location`. If imports fail right after a restart, suspect:
- The `--plugin-dir` or `--virtual-env-location` path changed, so the server created a new, empty venv.
- The container was replaced and the venv directory wasn't on a persistent volume.
- Filesystem permissions on the venv changed.

**Fix:** keep the venv path the same across restarts, persist it with a volume or bind mount in containers, and check that the InfluxDB process can read it.

### Air-gapped / package management disabled

`influxdb3 install package` fails because the server is offline or package management is disabled.
Pre-install dependencies before you disable package management.
See [`dependencies.md` → "Air-gapped / locked-down environments"](dependencies.md#air-gapped--locked-down-environments) for the flag to use on each version.

## Cache lifecycle gotchas

The plugin `Cache` is in-memory only. Common surprises:

- **Cache cleared on server restart.** Counters, last-seen timestamps, etc. reset to default. Plugins must handle the cold-cache case (`cache.get(k, default=...)`).
- **TTL eviction.** Keys with a `ttl` set are evicted after that many seconds. Reading an expired key returns the default.
- **Concurrent writes from async triggers.** If a trigger has `--run-asynchronous`, multiple concurrent invocations can read+write the same key concurrently — increment-by-1 patterns can lose updates. See [`references/state-and-cache.md` → "Concurrency"](state-and-cache.md#concurrency).

**Diagnose state by inspecting cache values from a temporary `process_request` plugin** that returns `cache.get(<key>)` — pattern documented in [`references/testing.md` → "Inspecting cache state"](testing.md#inspecting-cache-state). Don't bypass the `Cache` API and write to local disk; cache is in-memory by design ([`references/state-and-cache.md` → "When NOT to use the cache"](state-and-cache.md#when-not-to-use-the-cache)).

## Where to fetch more

- [`references/testing.md`](testing.md) for the offline test commands and the live-trigger iteration loop
- [`references/runtime-api.md`](runtime-api.md) for `influxdb3_local`, `LineBuilder`, `Cache`, `table_batches` shapes
- [`references/state-and-cache.md`](state-and-cache.md) for cache patterns and concurrency caveats
- `influxdb3` skill → [`references/troubleshooting.md`](../../influxdb3/references/troubleshooting.md) for app-side problems (writes not landing, queries returning 0 rows)
