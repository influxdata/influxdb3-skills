# Installing InfluxDB 3 (Core & Enterprise)

Covers Core and Enterprise on macOS and Linux. Two paths are spelled out here: the official install script (first-time / single-machine) and Docker (isolation). Other methods are listed under "Other install methods".

> **InfluxDB 3 Cloud** is a managed service, so it isn't installed locally. Sign up at https://www.influxdata.com/products/influxdb-overview/. Once you have credentials, return to [`references/connecting.md`](connecting.md). Don't create accounts for the developer.

> **Already have an instance running?** Skip to [`SKILL.md` §2](../SKILL.md#2-setup-checklist) (Setup checklist).

## Decision: Core or Enterprise?

| | Core | Enterprise |
|---|---|---|
| License | Free, open source | Commercial — needs license activation |
| Single-node | ✅ | ✅ |
| Multi-node clustering | ❌ | ✅ |
| HA / read replicas | ❌ | ✅ |
| Object store backends | local, S3, Azure, GCS | local, S3, Azure, GCS |
| When to pick | Trying it out, dev/test, small production | Production that needs HA or multiple nodes |

If you're not sure, start with Core. You can move to Enterprise later — the data format is compatible.

## Install path A: Official install script (fastest)

The script detects your OS and installs the latest release, not a pinned version. Use Docker or a package to pin a version.

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

The script prints where it installed the `influxdb3` binary. Add that directory to your `PATH`.

## Install path B: Docker

Image: `influxdb:3-core` or `influxdb:3-enterprise` (AMD64 and ARM64). Pin a version with a tag such as `influxdb:3.12.1-core`.

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

The interactive license prompt doesn't work in containers, so always pass the email and type. Watch for the verification step with `docker logs -f influxdb3-enterprise`. See [Enterprise license activation](#first-boot-starting-the-server) below.

Next, create the admin token in the container and store it in an environment variable. See [Bootstrap](#bootstrap-create-the-operatoradmin-token).

## Other install methods

For production, the docs recommend DEB/RPM packages, for their systemd sandboxing, or Docker with your own container security settings.
For package steps, link the [Core install page](https://docs.influxdata.com/influxdb3/core/install/) or the [Enterprise install page](https://docs.influxdata.com/influxdb3/enterprise/install/).

This file doesn't cover these methods step by step:

- **Linux DEB / RPM packages** (`apt-get install influxdb3-core` or `influxdb3-enterprise`). Settings live in `/etc/influxdb3/influxdb3-<core|enterprise>.conf` (TOML), which the package presets with `object-store`, `data-dir`, `plugin-dir` and `node-id`.
- **Binary tarballs** for Linux (AMD64, ARM64), macOS (Apple silicon) and Windows (AMD64).
- **Docker Compose**, and Kubernetes for Enterprise.

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

Each flag has an environment variable: `INFLUXDB3_LICENSE_EMAIL`, `INFLUXDB3_LICENSE_TYPE`, `INFLUXDB3_LICENSE_FILE` (v3.11+). Other `serve` flags follow the same pattern, for example `INFLUXDB3_OBJECT_STORE`, `INFLUXDB3_DATA_DIR`, and `INFLUXDB3_PLUGIN_DIR`.

> **Don't run a bare `serve`.** On a new cluster with no cached license, give the complete start command with `--license-email you@example.com` and `--license-type home` as marked placeholders, and ask the developer for their real email and type before you run it. Never run it with the placeholder email. Without `--license-email`, a non-interactive start fails with `No interactive TTY detected. Cannot prompt for email.` `--object-store memory` can't cache the license, so use a file store.

## Object store: required; use `file`, and avoid `memory` for anything you run more than once

`--object-store` (env `INFLUXDB3_OBJECT_STORE`) selects where the catalog and Parquet data live. It's **required and has no default** (3.2.1+), so every `serve` command must set it. Don't rely on `serve --help` text or older guides that name a default. For local work, use `--object-store file --data-dir <path>`. Supported backends:

| `--object-store` | Data | When to use |
|---|---|---|
| `file` | On disk under `--data-dir` (Parquet + catalog) | **Local/dev choice.** Survives restarts; license caches once; RAM stays bounded. Requires `--data-dir`. |
| `s3` / `google` / `azure` | Remote object store | Production and shared/multi-node storage. Each takes its own flags: `--bucket` plus `--aws-access-key-id`, `--aws-secret-access-key` and possibly `--aws-default-region` (s3), `--google-service-account` (google), or `--azure-storage-account` and `--azure-storage-access-key` (azure). See the install docs for each backend. |
| `memory-throttled` | RAM only, with simulated cloud latency | Testing behavior against a slow object store. Same RAM caveats as `memory`. |
| `memory` | **RAM only, nothing on disk** | Brief throwaway tests only. |

> **Warning:** `memory` holds *all* data in RAM — under sustained writes it grows unbounded and can OOM the host, and it won't cache the Enterprise license. For load generation or anything you'll restart, use `file` with a temp `--data-dir` (`rm -rf` it when done).

## Bootstrap: create the operator/admin token

The very first token is created without authentication (this only works once, and only against an instance that has no admin tokens yet).

> **Caution:** until the first admin token exists, the token endpoint accepts unauthenticated requests and the server listens on all interfaces (`--http-bind` defaults to `0.0.0.0:8181`). Create the token before exposing the port. On a reachable network, start with `--http-bind 127.0.0.1:8181` (Docker: publish `-p 127.0.0.1:8181:8181`), create the token, then restart on the address you want. Or start with a preconfigured admin token ([`doc-urls.md` → "Preconfigured admin token"](doc-urls.md)).

```bash
influxdb3 create token --admin
# Docker: docker exec influxdb3-core influxdb3 create token --admin
```

The token is shown once in the response, so copy it right away. Add `.env` to `.gitignore`, then save the values to `.env` and load them:
```bash
grep -qxF '.env' .gitignore 2>/dev/null || echo '.env' >> .gitignore
echo "INFLUXDB_HOST=http://localhost:8181" >> .env
echo "INFLUXDB_ADMIN_TOKEN=<paste-the-token-here>" >> .env
set -a; . ./.env; set +a
```

## Verify it works

```bash
influxdb3 --version
curl -sS -i -H "Authorization: Bearer $INFLUXDB_ADMIN_TOKEN" "$INFLUXDB_HOST/ping"
# expect: HTTP/1.1 200 OK with x-influxdb-build and x-influxdb-version headers
```

If you see `HTTP/1.1 200 OK` with `x-influxdb-build: Core` (or `Enterprise`), you're done.

To tell which edition and version an existing instance runs, use the docs' identify-version pages: https://docs.influxdata.com/influxdb3/core/admin/identify-version/ (same content under `/influxdb3/enterprise/`). [`references/flavor-detection.md`](flavor-detection.md) covers the full procedure.

> **Quirk:** `HEAD /ping` returns 404 — only `GET /ping` works. See [`references/quirks.md` entry 1](quirks.md#1-head-ping-returns-404-only-get-ping-works).

## Next steps

You now have a running, authenticated InfluxDB 3 instance. Pick your path:

- Want to write data and query it? → [`SKILL.md` §2](../SKILL.md#2-setup-checklist) (Setup checklist) → [§4](../SKILL.md#4-connecting-and-authenticating)–[§6](../SKILL.md#6-querying-data) (Connect, Write, Query)
- Want to provision a database now? → [`references/databases.md`](databases.md)
- Want to develop a Processing Engine plugin? → sibling skill `influxdb3-plugins`. The server needs `--plugin-dir`, which the commands above set.

## Where to fetch more

- Official Core docs: https://docs.influxdata.com/influxdb3/core/install/
- Official Enterprise docs: https://docs.influxdata.com/influxdb3/enterprise/install/
- [`references/doc-urls.md`](doc-urls.md) for additional install-related URLs
- Docs are the authority for flags and env vars.
