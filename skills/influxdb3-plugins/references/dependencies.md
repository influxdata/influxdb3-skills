# Plugin Python Dependencies

## The embedded venv rule (most important)

When the InfluxDB 3 server is started with `--plugin-dir`, it creates a Python virtual environment at `<PLUGIN_DIR>/venv` using the **bundled Python interpreter** that ships with the `influxdb3` binary. Plugins run inside *that* venv.

**Never** run `python -m venv` against your system Python and expect plugins to use it. The bundled Python and your system Python may differ in version and ABI, and the runtime will fail with cryptic import errors.

If you need a custom virtual environment, chain it off the bundled interpreter:

```bash
<PLUGIN_DIR>/venv/bin/python -m venv <new-venv>
```

## Install a Python package into the plugin venv

CLI (preferred):

```bash
influxdb3 install package pandas
influxdb3 install package requests numpy        # multiple at once
```

Docker:

```bash
docker exec -it <container_name> influxdb3 install package pandas
```

HTTP API:

```bash
curl -X POST "$INFLUXDB_HOST/api/v3/configure/plugin_environment/install_packages" \
  --header "Authorization: Bearer $INFLUXDB_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"packages": ["pandas", "requests", "numpy"]}'
```

The HTTP variant requires an admin token.

## When the plugin imports a package

In plugin code, `import` works just like in any Python script:

```python
import pandas as pd
import requests

def process_scheduled_call(influxdb3_local, call_time, args=None):
    rows = influxdb3_local.query("SELECT * FROM sensors WHERE time > now() - INTERVAL '1 hour'")
    df = pd.DataFrame(rows)
    influxdb3_local.info(f"DataFrame shape: {df.shape}")
```

The package must already be installed in the plugin venv before the trigger fires. If not, the plugin will raise `ImportError` and (depending on `--error-behavior`) be logged, retried, or disabled.

## Air-gapped / locked-down environments

Start the server with `--package-manager disabled` to block runtime package installation:

```bash
influxdb3 serve \
  --node-id node0 \
  --object-store file \
  --data-dir ~/.influxdb3 \
  --plugin-dir ~/.plugins \
  --package-manager disabled
```

When disabled:
- Existing pre-installed packages still work.
- The Processing Engine still runs triggers normally.
- New `influxdb3 install package` calls and the HTTP install endpoint are blocked.

**Pre-install everything you need before disabling.** This pattern is for compliance environments that prohibit runtime package installation. Full air-gapped configuration (offline mirrors, custom plugin repos, etc.) is the v0.3.0 scope.

## Where to fetch more

`references/doc-urls.md` → "Processing engine and Python plugins" → "Manage plugin dependencies" section.
