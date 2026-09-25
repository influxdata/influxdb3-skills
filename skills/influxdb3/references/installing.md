# Installing InfluxDB 3 (Core & Enterprise)

For users who installed the `influxdb3-skills` plugin but don't have a server yet. Covers Core and Enterprise on macOS / Linux. Two paths: official install script (recommended for first-time / single-machine), or Docker (recommended if you want isolation).

> **Cloud Serverless and Cloud Dedicated** are managed services — they're not installed locally. Sign up at https://www.influxdata.com/products/influxdb-overview/ for those flavors. Once you have credentials, return to `references/connecting.md`. The agent doesn't create accounts on your behalf.

> **Already have an instance running?** Skip to `SKILL.md` §2 (First-time setup checklist).

## Decision: Core or Enterprise?

| | Core | Enterprise |
|---|---|---|
| License | Free, open source | Commercial — needs license activation |
| Single-node | ✅ | ✅ |
| Multi-node clustering | ❌ | ✅ |
| Last-value & distinct-value caches | ❌ | ✅ |
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

Best when you want isolation, easy version pinning, or are testing alongside an existing install.

**Core:**
```bash
docker run -d \
  --name influxdb3-core \
  -p 8181:8181 \
  -v $(pwd)/influxdb3-data:/var/lib/influxdb3 \
  -v $(pwd)/influxdb3-plugins:/plugins \
  influxdb/influxdb3-core \
  serve \
    --node-id node0 \
    --object-store file \
    --data-dir /var/lib/influxdb3 \
    --plugin-dir /plugins
```

**Enterprise** (adds `--cluster-id`; license activation happens on first run via container stderr):
```bash
docker run -it \
  --name influxdb3-enterprise \
  -p 8181:8181 \
  -v $(pwd)/influxdb3-data:/var/lib/influxdb3 \
  -v $(pwd)/influxdb3-plugins:/plugins \
  influxdb/influxdb3-enterprise \
  serve \
    --node-id node0 \
    --cluster-id mycluster \
    --object-store file \
    --data-dir /var/lib/influxdb3 \
    --plugin-dir /plugins \
    --license-email you@example.com \
    --license-type home
```

Use `-it` (not `-d`) for the first Enterprise boot so you can see the email-verification prompt. After the license is cached in the data volume, subsequent boots can run with `-d` (detached).

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

`--cluster-id` is required on Enterprise — it prefixes the location of the Enterprise Catalog in the object store. Pick any string; it sticks for the lifetime of that deployment.

**Enterprise license activation:** Enterprise will not boot without a license. `--license-email` and `--license-type` are **required on first boot** (unless you supply `--license-file`). On first boot, Enterprise sends a verification email to `--license-email`; click the link to activate. After verification, the license is cached in the object store under `<cluster-id>/trial_or_home_license` and subsequent boots are non-interactive. License types:

| `--license-type` | Use it for |
|---|---|
| `home` | Personal / non-commercial use. Free. |
| `trial` | Time-limited evaluation. Free. |
| `commercial` | Production. Provided via `--license-file` after working with InfluxData sales. |

If you already have a license file, pass `--license-file <path>` and skip `--license-email` / `--license-type`.

> **ASK for the license — don't run a bare `serve`.** On a new/fresh cluster (no cached license), ask the developer for their license email and type before generating the start command, then pass `--license-email` + `--license-type` (use their real email, not the placeholder). A license-less non-interactive start **fails fast** with `No interactive TTY detected. Cannot prompt for email.` — it does not hang; supplying `--license-email` is what avoids the prompt. Note: `--object-store memory` can't cache the license, so prefer a file store (below).

## Object store: `file` is the default; avoid `memory` for anything you run more than once

`--object-store` selects where the catalog and Parquet data live. It **defaults to `file`** (local filesystem, requires `--data-dir <path>`). Supported backends:

| `--object-store` | Data | When to use |
|---|---|---|
| `file` (default) | On disk under `--data-dir` (Parquet + catalog) | **Local/dev default.** Survives restarts; license caches once; RAM stays bounded. Requires `--data-dir`. |
| `s3` / `google` / `azure` | Remote object store | Production and shared/multi-node storage. Each takes its own flags (`--bucket`, region/credentials) — see `doc-urls.md`. |
| `memory` | **RAM only, nothing on disk** | Brief throwaway tests only. |

> **`serve --help` is wrong here:** it claims the default is `memory`; the real default is `file` (confirmed in source and at runtime).

> **Warning:** `memory` holds *all* data in RAM — under sustained writes it grows unbounded and can OOM the host, and it won't cache the Enterprise license. For load generation or anything you'll restart, use `file` with a temp `--data-dir` (`rm -rf` it when done).

## Bootstrap: create the operator/admin token

The very first token is created without authentication (this only works once, and only against an instance that has no admin tokens yet).

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
curl -sS -i http://localhost:8181/ping
# expect: HTTP/1.1 200 OK with x-influxdb-build header
```

If you see `HTTP/1.1 200 OK` with `x-influxdb-build: Core` (or `Enterprise`), you're done.

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
