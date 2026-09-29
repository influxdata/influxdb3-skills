# Installing InfluxDB 3 (Core & Enterprise)

For users who installed the `influxdb3-skills` plugin but don't have a server yet. Covers Core and Enterprise on macOS / Linux. Two paths are spelled out here: the official install script (first-time / single-machine) and Docker (isolation). Other methods are listed under "Other install methods".

> **Cloud Serverless and Cloud Dedicated** are managed services — they're not installed locally. Sign up at https://www.influxdata.com/products/influxdb-overview/ for those flavors. Once you have credentials, return to `references/connecting.md`. The agent doesn't create accounts on your behalf.

> **Already have an instance running?** Skip to `SKILL.md` §2 (First-time setup checklist).

## Decision: Core or Enterprise?

| | Core | Enterprise |
|---|---|---|
| License | Free, open source | Commercial — needs license activation |
| Single-node | ✅ | ✅ |
| Multi-node clustering | ❌ | ✅ |
| Last-value & distinct-value caches | ✅ | ✅ |
| HA / read replicas | ❌ | ✅ |
| Object store backends | local, S3, Azure, GCS | local, S3, Azure, GCS |
| When to pick | Trying it out, dev/test, small production | Production with HA needs, performance primitives, multi-node |

If you're not sure, start with Core. You can move to Enterprise later — the data format is compatible.

## Install path A: Official install script (fastest)

The script auto-detects your OS, downloads the right binary, and puts it under `~/.influxdb/`.

**Core:**
```bash
curl -O https://www.influxdata.com/d/install_influxdb3.sh
sh install_influxdb3.sh
```

**Enterprise:**
```bash
curl -O https://www.influxdata.com/d/install_influxdb3.sh
sh install_influxdb3.sh enterprise
```

After install, `~/.influxdb/influxdb3` is the binary. You may want to symlink it onto your PATH:
```bash
sudo ln -s ~/.influxdb/influxdb3 /usr/local/bin/influxdb3
```

## Install path B: Docker

Image: `influxdb:3-core` or `influxdb:3-enterprise` (AMD64 and ARM64). Pin a version with a tag such as `influxdb:3.10-core`.

Best when you want isolation, easy version pinning, or are testing alongside an existing install.

**Core:**
```bash
docker run -d \
  --name influxdb3-core \
  -p 8181:8181 \
  -v $(pwd)/influxdb3-data:/var/lib/influxdb3 \
  -v $(pwd)/influxdb3-plugins:/plugins \
  influxdb:3-core \
  serve \
    --node-id node0 \
    --object-store file \
    --data-dir /var/lib/influxdb3 \
    --plugin-dir /plugins
```

**Enterprise** (adds `--cluster-id`; the license email must be passed on first boot):
```bash
docker run -d \
  --name influxdb3-enterprise \
  -p 8181:8181 \
  -v $(pwd)/influxdb3-data:/var/lib/influxdb3 \
  -v $(pwd)/influxdb3-plugins:/plugins \
  influxdb:3-enterprise \
  serve \
    --node-id node0 \
    --cluster-id mycluster \
    --object-store file \
    --data-dir /var/lib/influxdb3 \
    --plugin-dir /plugins \
    --license-email you@example.com \
    --license-type home
```

The interactive license prompt doesn't work in containers, so always pass the email (`--license-email` or the `INFLUXDB3_LICENSE_EMAIL` env var) and a type. The server then waits for you to click the verification link in the email. Watch progress with `docker logs -f influxdb3-enterprise`. After verification the license is cached in the data volume and later boots need no interaction.

## Other install methods

Not covered step by step here. Follow the docs for these:

- **Linux DEB / RPM packages** (`apt-get install influxdb3-core` or `influxdb3-enterprise`): docs recommend these for non-Docker production because the systemd unit adds sandboxing. Settings live in `/etc/influxdb3/influxdb3-<core|enterprise>.conf` (TOML), which the package presets with `object-store`, `data-dir`, `plugin-dir` and `node-id`.
- **Binary tarballs** for Linux (AMD64, ARM64), macOS (Apple silicon) and Windows (AMD64).
- **Docker Compose**, and Kubernetes for Enterprise.

Docs: https://docs.influxdata.com/influxdb3/core/install/ and https://docs.influxdata.com/influxdb3/enterprise/install/

## First boot: starting the server

(After install via the script. Docker users — skip; the container started already.)

**Core** (no cluster-id — that flag is Enterprise-only):
```bash
mkdir -p ~/.influxdb/data ~/.influxdb/plugins
influxdb3 serve \
  --node-id node0 \
  --object-store file \
  --data-dir ~/.influxdb/data \
  --plugin-dir ~/.influxdb/plugins
```

**Enterprise** (adds `--cluster-id`, plus license activation on first boot):
```bash
mkdir -p ~/.influxdb/data ~/.influxdb/plugins
influxdb3 serve \
  --node-id node0 \
  --cluster-id mycluster \
  --object-store file \
  --data-dir ~/.influxdb/data \
  --plugin-dir ~/.influxdb/plugins \
  --license-email you@example.com \
  --license-type home
```

`--cluster-id` is required on Enterprise — it prefixes the location of the Enterprise Catalog in the object store. Pick any string that differs from `--node-id`; it sticks for the lifetime of that deployment.

**Enterprise license activation:** Enterprise will not boot without a license. `--license-email` and `--license-type` are **required on first boot** (unless you supply `--license-file`). On first boot, Enterprise sends a verification email to `--license-email`; click the link to activate. Until you do, a non-interactive server sits at `Waiting for verification...`. After verification, the license is cached in the object store under `<cluster-id>/trial_or_home_license` (commercial: `<cluster-id>/commercial_license`) and subsequent boots are non-interactive. In v3.10+ you can copy a valid license file to another deployment's object store at that path. Treat license files as secrets. License types:

| `--license-type` | Use it for |
|---|---|
| `home` | Personal / non-commercial use. Free. |
| `trial` | Time-limited evaluation. Free. |
| `commercial` | Production. Provided via `--license-file` after working with InfluxData sales. |

If you already have a license file, pass `--license-file <path>` and skip `--license-email` / `--license-type`. The two options are mutually exclusive.

Each flag has an environment variable: `INFLUXDB3_LICENSE_EMAIL`, `INFLUXDB3_LICENSE_TYPE`, `INFLUXDB3_LICENSE_FILE` (v3.11+). The older `INFLUXDB3_ENTERPRISE_LICENSE_*` and `INFLUXDB3_ENTERPRISE_CLUSTER_ID` names still work but log a deprecation warning. Other `serve` flags follow the same pattern, for example `INFLUXDB3_OBJECT_STORE`, `INFLUXDB3_DATA_DIR` (formerly `INFLUXDB3_DB_DIR`) and `INFLUXDB3_PLUGIN_DIR`.

> **ASK for the license — don't run a bare `serve`.** On a new/fresh cluster (no cached license), ask the developer for their license email and type before generating the start command, then pass `--license-email` + `--license-type` (use their real email, not the placeholder). A license-less non-interactive start **fails fast** with `No interactive TTY detected. Cannot prompt for email.` — it does not hang; supplying `--license-email` is what avoids the prompt. Note: `--object-store memory` can't cache the license, so prefer a file store (below).

## Object store: required; use `file`, and avoid `memory` for anything you run more than once

`--object-store` (env `INFLUXDB3_OBJECT_STORE`) selects where the catalog and Parquet data live. It's **required and has no default** (3.2.1+), so every `serve` command must set it. Don't rely on `serve --help` text or older guides that name a default. Supported backends:

| `--object-store` | Data | When to use |
|---|---|---|
| `file` | On disk under `--data-dir` (Parquet + catalog) | **Local/dev choice.** Survives restarts; license caches once; RAM stays bounded. Requires `--data-dir`. |
| `s3` / `google` / `azure` | Remote object store | Production and shared/multi-node storage. Each takes its own flags: `--bucket` plus `--aws-access-key-id`, `--aws-secret-access-key` and possibly `--aws-default-region` (s3), `--google-service-account` (google), or `--azure-storage-account` and `--azure-storage-access-key` (azure). See `doc-urls.md`. |
| `memory-throttled` | RAM only, with simulated cloud latency | Testing behavior against a slow object store. Same RAM caveats as `memory`. |
| `memory` | **RAM only, nothing on disk** | Brief throwaway tests only. |

> **Warning:** `memory` holds *all* data in RAM — under sustained writes it grows unbounded and can OOM the host, and it won't cache the Enterprise license. For load generation or anything you'll restart, use `file` with a temp `--data-dir` (`rm -rf` it when done).

## Bootstrap: create the operator/admin token

The very first token is created without authentication (this only works once, and only against an instance that has no admin tokens yet).

> **Caution:** until the first admin token exists, the token endpoint accepts unauthenticated requests and the server listens on all interfaces (`--http-bind` defaults to `0.0.0.0:8181`). Create the token before exposing the port. On a reachable network, start with `--http-bind 127.0.0.1:8181` (Docker: publish `-p 127.0.0.1:8181:8181`), create the token, then restart on the address you want. Or start with a preconfigured admin token (see `doc-urls.md`).

```bash
influxdb3 create token --admin
```

The plaintext token is shown ONCE in the response — copy it immediately. Save to a `.env`:
```bash
echo "INFLUXDB_HOST=http://localhost:8181" >> .env
echo "INFLUXDB_TOKEN=<paste-the-token-here>" >> .env
echo ".env" >> .gitignore
```

## Verify it works

```bash
influxdb3 --version
curl -sS -i -H "Authorization: Bearer $INFLUXDB_TOKEN" http://localhost:8181/ping
# expect: HTTP/1.1 200 OK with x-influxdb-build and x-influxdb-version headers
```

If you see `HTTP/1.1 200 OK` with `x-influxdb-build: Core` (or `Enterprise`), you're done. `/ping` needs a token by default; see `references/quirks.md` entry 1 for the opt-out.

To tell which edition and version an existing instance runs, use the docs' identify-version pages: https://docs.influxdata.com/influxdb3/core/admin/identify-version/ (same content under `/influxdb3/enterprise/`). `references/flavor-detection.md` covers the full procedure.

> **Quirk:** `HEAD /ping` returns 404 — only `GET /ping` works. See `references/quirks.md` entry 1.

## Next steps

You now have a running, authenticated InfluxDB 3 instance. Pick your path:

- Want to write data and query it? → `SKILL.md` §2 (First-time setup checklist) → §4–§6 (Connect, Write, Query)
- Want to provision a database now? → `references/databases.md`
- Want to develop a Processing Engine plugin? → sibling skill `influxdb3-plugins` (you'll need to ensure `--plugin-dir` is set, which the commands above already do)

## Where to fetch more

- Official Core docs: https://docs.influxdata.com/influxdb3/core/install/
- Official Enterprise docs: https://docs.influxdata.com/influxdb3/enterprise/install/
- `references/doc-urls.md` for additional install-related URLs
- Docs are the authority for flags and env vars; this file follows them except where the claims ledger verified otherwise against a live instance.
