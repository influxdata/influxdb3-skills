# Curated Documentation URLs (Processing Engine plugins)

When the skill content does not cover a developer's plugin question — or when the answer might be version-sensitive — fetch from this list. **Do not invent URLs that aren't on this list.** If you need a doc that's not here, ask the developer for the URL or note that the answer requires fresh research.

> **This is an advisory allowlist, not an enforced egress control.** Nothing parses this file to block other destinations — it's a rule a cooperating agent follows. Match the **exact host** (`docs.influxdata.com`, `github.com`) and reject lookalikes that merely contain it (suffix `…influxdata.com.evil.example`, `user@` prefix, unexpected subdomain, raw IP literal). Never fetch internal/link-local or cloud-metadata addresses (`169.254.169.254`, `localhost`, RFC1918). Real egress restriction belongs at the harness/network layer.

## Processing Engine concept docs

| Topic | URL | When to fetch |
|---|---|---|
| Processing engine and Python plugins | https://docs.influxdata.com/influxdb3/enterprise/plugins/ | Concepts, plugin types, trigger types, security overview |
| Extend plugins with API features and state management | https://docs.influxdata.com/influxdb3/enterprise/plugins/extend-plugin/ | `influxdb3_local`, `LineBuilder`, `Cache` deeper docs |
| Plugin library | https://docs.influxdata.com/influxdb3/enterprise/plugins/library/ | Browse official + community plugins |
| Processing engine reference | https://docs.influxdata.com/influxdb3/enterprise/reference/processing-engine/ | Enable/disable, distributed considerations |

## CLI reference

| Command | URL | When to fetch |
|---|---|---|
| `influxdb3 create trigger` | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/create/trigger/ | All flags for trigger creation |
| `influxdb3 test` (overview) | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/test/ | Test command overview |
| `influxdb3 test wal_plugin` | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/test/wal_plugin/ | Offline WAL plugin test |
| `influxdb3 show plugins` | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/show/plugins/ | List installed plugins |

## HTTP API

| Topic | URL | When to fetch |
|---|---|---|
| HTTP API reference (overview) | https://docs.influxdata.com/influxdb3/enterprise/api/v3/ | All endpoints; section "Processing-engine" for trigger config |

## Plugin examples and reference architecture

| Topic | URL | When to fetch |
|---|---|---|
| Official + community plugins | https://github.com/influxdata/influxdb3_plugins | Real-world plugin patterns; the `gh:` prefix resolves here by default |
| Reference architecture (cluster) | https://github.com/influxdata/influxdb3-ref-network-telemetry | 5-node Enterprise cluster reference |
