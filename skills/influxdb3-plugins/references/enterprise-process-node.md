# Enterprise standalone process nodes

Use this reference for Enterprise cluster placement, routing, migration, or restart diagnosis.
These are documentation-grounded changes for InfluxDB 3 Enterprise 3.12.0, reviewed on 2026-10-28 from merged [docs-v2 #7952](https://github.com/influxdata/docs-v2/pull/7952) and open [#7956](https://github.com/influxdata/docs-v2/pull/7956), head `77ab70ecd220b15987fc664ab637a9c1777906b7`.
They have not been live-verified here. Check the server edition and version before applying them.
For complete cluster setup, fetch [Configure a standalone process node](https://docs.influxdata.com/influxdb3/enterprise/admin/processing-engine/).
If the follow-up is not published yet, consult the PR source for its migration corrections.

## Configuration and placement

- Recommend one standalone process node with `--mode=process` and `--plugin-dir`. It runs all three trigger types and neither stores writes nor answers data queries. Mixed nodes share plugin CPU, memory, and restart interruptions with their other workloads.
- `--plugin-dir` or `INFLUXDB3_PLUGIN_DIR` automatically adds `process` mode regardless of `--mode`. Explicit `--mode=process` without a plugin directory fails at startup.
- Keep the plugin directory configured only on the process node and use explicit modes on other cluster nodes. The official Docker image inherits `INFLUXDB3_PLUGIN_DIR=/plugins`; disable it on non-process containers with `-e INFLUXDB3_UNSET_VARS=INFLUXDB3_PLUGIN_DIR`.
- Use the cluster's shared object store, cluster ID, license, and internode credentials, with a unique node ID. Enable `--internode-bind-addr` on every ingest and query node. Their advertised `conn_info` addresses must resolve and be reachable from the process node; set `--conn-info` when needed. The standalone process node itself doesn't need an internode listener.
- Create triggers against the process node with `--node-spec nodes:PROCESS_NODE_ID`, substituting its actual node ID. `--node-spec` is Enterprise-specific. The default `all` lets every process node schedule the trigger independently, duplicating WAL and scheduled work when several process nodes exist. Placement is immutable; moving a trigger requires deleting and recreating it.

In Enterprise 3.12, a standalone process node reads every ingest node's WAL through object storage. It begins at the current WAL position when it first detects the ingest node, without processing earlier writes. Before 3.12.0, standalone process nodes cannot run WAL triggers for other nodes and log `Ingest mode not configured; processing engine will not run wal flush triggers.`

## Request routing and failures

| Operation | Destination |
|---|---|
| Create a trigger, upload plugin files, install Python packages | Process node |
| Call `/api/v3/engine/<path>` | Process node selected by the trigger's `--node-spec` |
| Write application data | Ingest node |
| Query data, trigger metadata, or `system.processing_engine_logs` | Query node |
| Create a database; enable, disable, or delete a trigger; stop a node | Any node |

Packages and uploaded files are local to the receiving process node. Install dependencies there with `influxdb3 install package --host "$PROCESS_HOST" --token "$INFLUXDB_TOKEN" PACKAGE_NAME`.
Plugin queries use query nodes; plugin writes and persisted log messages use ingest nodes over the internode protocol.

Check both the trigger database's `system.processing_engine_logs` on a query node and the process node's server log. Python tracebacks and deferred-write failures may appear only in the server log. `write()` and `write_to_db()` queue rows until the plugin returns; failures can lose rows without raising in the plugin. Prefer `write_sync()` or `write_sync_to_db()` when the plugin needs to handle failures.

- `no remote query client found` or `no remote write client found`: check running query or ingest nodes and their internode listeners. Missing ingest connectivity also prevents plugin log persistence.
- DNS or `circuit-open` errors: check advertised `conn_info`, DNS, and reachability from the process node.
- Request trigger `404`: the process node doesn't own that trigger. `405`: the destination doesn't run the Processing Engine. Send requests to the selected process node, independently of data-query routing.
- Verify modes, state, and addresses by querying `SELECT node_id, mode, state, conn_info FROM system.nodes` on a query node with database `_internal`.

## Migration from a mixed node

Upgrade the cluster first. If WAL plugins must process every write, pause writes during cutover because the new process node doesn't replay earlier WAL history.

1. Record each trigger's name, database, plugin path, specification, arguments, and error behavior. Disable the triggers.
2. Start the standalone process node with the existing cluster ID and object store and a unique node ID. Configure internode connectivity, copy plugin files, and install dependencies on it.
3. Remove `process`, `--plugin-dir`, and `INFLUXDB3_PLUGIN_DIR` from former plugin nodes, then restart them with explicit intended modes. Apply the Docker unset override above where needed.
4. Delete each disabled trigger and recreate it on the new process node with the recorded settings and `--node-spec nodes:PROCESS_NODE_ID`.
5. Route request-trigger calls and package installation to the new process node, data queries to query nodes, and writes to ingest nodes.
6. Verify cluster modes and addresses, test triggers, and inspect both log destinations. Resume writes only after verifying WAL trigger execution.

## Restart and known issues in Enterprise 3.12.0

Trigger scheduler state persists in object storage at `<cluster-id>/<node-id>/processing_engine/restart-state.postcard`, periodically and at shutdown. This is separate from the volatile plugin cache.
WAL triggers resume from saved positions only if the required WAL files remain available. Schedule triggers catch up missed calls and retain pending retries. Request invocations aren't replayed; graceful shutdown returns `503`, and a forced stop drops the connection. WAL or scheduled calls can repeat after restart, so make their effects idempotent.

- Queued runs can fail with `WAL object ... is no longer available` if ingest nodes remove WAL files before execution. Check the process node's server log.
- After an outage exceeding WAL retention, WAL triggers can silently stop. Check that `influxdb3_processing_engine_wal_processed_watermark` increases in the process node's `/metrics` while writes arrive. The documented workaround is another process-node restart.
- A corrupt restart-state object can prevent startup. Removing it loses queued runs, pending retries, and saved WAL positions. Back up the object before removing the original and restarting.
- `influxdb3 show plugins` can be empty and `system.plugin_files` unavailable on a process node despite existing files. Inspect the plugin directory instead of treating an empty listing as proof the engine is disabled.
- `system.processing_engine_triggers` doesn't expose `--node-spec`. Use recorded creation settings to recover placement and `node_id` in plugin logs or the server log to observe execution.
- Plugin queries of string columns in `system.nodes` can fail on `Utf8View`. Query with `database="_internal"` and convert string columns with `arrow_cast(<column>, 'Utf8')`; `CAST(... AS VARCHAR)` doesn't fix it.
- The actual embedded environment is `<PLUGIN_DIR>/.venv`; the configuration template's `/venv` path is incorrect.
- Some Processing Engine and internode options appear only in `influxdb3 serve --help-all`.
- Docker Desktop containers with bind-mounted data can exit with code 133 because of a restart-state conflict. Consult the release notes before changing persisted state.

Fetch the [Enterprise release notes](https://docs.influxdata.com/influxdb3/enterprise/release-notes/#known-issues) for current issue status. Each trigger queues up to 60 pending runs; a full request-trigger queue returns `503` with `{"error": "trigger queue is full"}`.
