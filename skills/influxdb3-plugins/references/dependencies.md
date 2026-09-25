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

> **`install package` is a supply-chain trust boundary.** Package names go to `pip` against public PyPI with **no typosquat protection** — a misspelled or look-alike name (`reqeusts`, `panndas`) installs and then becomes importable by unsandboxed plugin code (`references/plugin-code-safety.md`). Extra arguments are passed to `pip` verbatim, so a stray `--index-url http://attacker/…` or `--extra-index-url` redirects where packages come from. Install only names you've verified, pin versions (`pandas==2.2.2`), and prefer a vetted internal index; in locked-down deployments use `--package-manager disabled` (below) to turn this surface off entirely.

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

The flag that blocks runtime package installation depends on the server version.
Check that the user's binary accepts the flag (`influxdb3 serve --help` lists it) before you generate a start command.

| Server version | Flag | Behavior |
|---|---|---|
| 3.11.0+ | `--disable-package-management` (env `INFLUXDB3_DISABLE_PACKAGE_MANAGEMENT`) | The server never creates or changes a virtual environment and never runs `pip`. Package-install API calls are rejected. You manage the virtual environment yourself and point the server at it with `VIRTUAL_ENV`. Takes precedence over `--package-manager`. |
| 3.10.x | `--package-manager disabled` | `--package-manager` is deprecated (3.10+), and the server prints a deprecation warning. `disabled` still blocks package-install API calls. |
| Earlier than 3.10 | `--package-manager disabled` | Blocks package-install API calls. |

The 3.11.0 release notes add `--disable-package-management`, but the reference docs don't describe it yet.
The behavior in the first row comes from the 3.11.5 `--help` text and hasn't been behavior-tested.

```bash
influxdb3 serve \
  --node-id node0 \
  --object-store file \
  --data-dir ~/.influxdb3 \
  --plugin-dir ~/.plugins \
  --disable-package-management
```

`pip` is always the package installer, and `uv` isn't used (3.10+).

When package installation is blocked:
- Existing pre-installed packages still work.
- The Processing Engine still runs triggers normally.
- New `influxdb3 install package` calls and the HTTP install endpoint are rejected.

**Pre-install everything you need before you block installation.** This pattern is for compliance environments that prohibit runtime package installation. Full air-gapped configuration (offline mirrors, custom plugin repos, and so on) is out of scope; see the docs.

## Where to fetch more

`references/doc-urls.md` → "Processing engine and Python plugins" → "Manage plugin dependencies" section.
