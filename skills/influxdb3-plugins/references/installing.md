> **Looking for the InfluxDB 3 *server* install?** This file covers Processing Engine plugin install / deploy on a server that's already running. For installing the server itself, see `skills/influxdb3/references/installing.md`.

# Installing & Deploying Plugins

## Activate the Processing Engine

The engine activates when the server is started with `--plugin-dir` (or `INFLUXDB3_PLUGIN_DIR` env var) pointing at a directory.

| Deployment | Default | Configuration |
|---|---|---|
| Docker images | Enabled | `INFLUXDB3_PLUGIN_DIR=/plugins` |
| DEB/RPM packages | Enabled | `plugin-dir="/var/lib/influxdb3/plugins"` |
| Binary / source | Disabled | Add `--plugin-dir <path>` at server start |

Verify the engine is enabled:

```bash
curl -sS "$INFLUXDB_HOST/api/v3/configure/database?format=json" \
  -H "Authorization: Bearer $INFLUXDB_TOKEN" | jq '.[].iox::database'
```

If the engine is on, `_internal` will be in the database list. (`_internal` always exists; the indicator is that `system.plugin_files` and `system.processing_engine_logs` work — see `references/testing.md`.)

## Three install paths

### 1. Upload from local machine (preferred for development)

Use `--upload` with `--path` pointing at a local file or directory. Best for rapid iteration.

```bash
# Single-file
influxdb3 create trigger \
  --trigger-spec "every:1m" \
  --path "/absolute/local/path/my_plugin.py" \
  --upload \
  --database my_database \
  my_trigger

# Multi-file directory
influxdb3 create trigger \
  --trigger-spec "table:sensors" \
  --path "/absolute/local/path/my_alert/" \
  --upload \
  --database my_database \
  alert_trigger
```

Equivalent HTTP API for raw file upload (without creating a trigger):

```bash
curl -X PUT "$INFLUXDB_HOST/api/v3/plugins/files?path=my_plugin.py" \
  --header "Authorization: Bearer $INFLUXDB_TOKEN" \
  --header "Content-Type: application/octet-stream" \
  --data-binary "@/absolute/local/path/my_plugin.py"
```

### 2. Server-side placement (preferred for production)

Copy the plugin file or directory into the server's `--plugin-dir` via your deploy tooling (rsync, container volume mount, file sync). Then create the trigger with the relative path:

```bash
influxdb3 create trigger \
  --trigger-spec "every:1m" \
  --path "my_plugin.py" \
  --database my_database \
  my_trigger
```

### 3. Reference an upstream plugin via `gh:` prefix

Reference plugins from the official `influxdata/influxdb3_plugins` repo without downloading them:

```bash
influxdb3 create trigger \
  --trigger-spec "every:1m" \
  --path "gh:influxdata/system_metrics/system_metrics.py" \
  --database my_database \
  system_metrics_trigger
```

To use a custom plugin repo (private mirror, internal staging), start the server with `--plugin-repo <url>`:

```bash
influxdb3 serve \
  --node-id node0 \
  --object-store file \
  --data-dir ~/.influxdb3 \
  --plugin-dir ~/.plugins \
  --plugin-repo "https://internal.company.com/influxdb-plugins/"
```

Then `--path "gh:myorg/custom_plugin.py"` resolves against that custom URL.

> **Trust boundary: `gh:` and `--plugin-repo` fetch code that then runs unsandboxed.** The server retrieves the referenced file over the network and executes it with full server privileges (see `references/plugin-code-safety.md`) — there is **no signature, checksum, or version pin**, so whoever controls the repo (or `--plugin-repo` URL, or a MITM on a non-HTTPS fetch) controls what runs. Pin to a repo you trust, use HTTPS, and **read third-party plugin code before deploying it**. Whoever can set `--plugin-repo` at server start chooses the code source for every later `gh:` reference.

## Updating a plugin in place

Use `influxdb3 update trigger` with `--path` pointing at the new code. Trigger configuration (spec, arguments, error-behavior) is preserved.

```bash
influxdb3 update trigger \
  --database my_database \
  --trigger-name my_trigger \
  --path "/absolute/local/path/my_plugin.py"
```

## Listing installed plugins

CLI:

```bash
influxdb3 show plugins --token "$INFLUXDB_TOKEN"
influxdb3 show plugins --format json --token "$INFLUXDB_TOKEN"
```

SQL (against the `_internal` database):

```bash
influxdb3 query \
  -d _internal \
  "SELECT plugin_name, file_name, size_bytes, last_modified FROM system.plugin_files ORDER BY plugin_name" \
  --token "$INFLUXDB_TOKEN"
```

Schema columns: `plugin_name` (str), `file_name` (str), `file_path` (str), `size_bytes` (int64), `last_modified` (int64 milliseconds since epoch).

## Security

Plugin upload, update, and trigger creation **require an admin token**. Use a database-scoped token for the application code that *talks to* InfluxDB; use the admin token only for plugin lifecycle operations.

The server enforces:
- **Path traversal protection** — paths containing `..` or starting with `/` are rejected. Always use relative paths under `--plugin-dir`, or absolute paths only with `--upload` (the server resolves the upload destination).
- **Symlink escape protection** — symlinks that resolve outside `--plugin-dir` are rejected.
- **Admin-only deploys** — non-admin tokens cannot upload, update, or create triggers.

**Never inline a token in generated commands or scripts.** Tokens come from `INFLUXDB_TOKEN` env or `args` passed to the plugin (per `references/connecting.md` in the `influxdb3` skill).

**What the server does *not* protect against** (admin-token-gated, but code-execution-equivalent once reached — an admin token on InfluxDB is effectively arbitrary code in the server process):
- **`gh:` / `--plugin-repo`** fetch and run remote code with no integrity check (above).
- **`influxdb3 install package`** installs from public PyPI with no typosquat protection, and extra arguments reach `pip` verbatim (e.g. a redirected `--index-url`) — see `references/dependencies.md`.
- **A deployed plugin is unsandboxed** — `references/plugin-code-safety.md`.

**Plugin hardening flags** (3.10.0 and later):
- `--plugin-dir-only` — disables `gh:` fetches and `--upload`, restricting plugins to files already placed in `--plugin-dir` (server-side placement, path 2). This is the single most effective lockdown for plugin sourcing. **Enterprise only** — not available on Core, where the admin token is the entire boundary for plugin sourcing.
- `--restrict-plugin-triggers-to` — limits which trigger types may be created (`[possible values: wal, schedule, request]`). **Available on both Core and Enterprise.**

For deployments where a compromised or hostile plugin is in scope, the control that holds even against fully-unsandboxed plugin code is **network egress restriction on the server host** — enforce it at the harness/network layer.

## Where to fetch more

`references/doc-urls.md` → "Processing engine and Python plugins" → setup, upload, security sections.
