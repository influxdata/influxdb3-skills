# Installing InfluxDB 3 (Core & Enterprise)

For users who installed the `claude-influxdb3` plugin but don't have a server yet. Covers Core and Enterprise on macOS / Linux. Two paths: official install script (recommended for first-time / single-machine), or Docker (recommended if you want isolation).

> **Cloud Serverless and Cloud Dedicated** are managed services — they're not installed locally. Sign up at https://www.influxdata.com/products/influxdb-cloud/ for those flavors. Once you have credentials, return to `references/connecting.md`. Claude does not create accounts on your behalf.

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
  serve --node-id node0 --object-store file --data-dir /var/lib/influxdb3 --plugin-dir /plugins
```

**Enterprise:** same shape, image is `influxdb/influxdb3-enterprise`.

For Enterprise, you'll need a license activation step on first run — the container's stderr will print the activation URL.

## First boot: starting the server

(After install via the script. Docker users — skip; the container started already.)

**Core:**
```bash
mkdir -p ~/.influxdb/data ~/.influxdb/plugins
influxdb3 serve \
  --node-id node0 \
  --object-store file \
  --data-dir ~/.influxdb/data \
  --plugin-dir ~/.influxdb/plugins
```

**Enterprise:** same flags. First boot will print a license-activation URL — open it in a browser, register, paste the activation token back as prompted.

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
