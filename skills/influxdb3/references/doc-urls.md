# Curated Documentation URLs

When the skill content does not cover a developer's question — or when the answer might be version-sensitive — fetch from this list. **Don't invent URLs.** If you need a doc that's not here, use the InfluxDB Documentation MCP server, or say that the answer needs a docs lookup.

> Fetch only from the exact hosts `docs.influxdata.com` and `github.com`. Reject lookalike hosts, IP literals, and internal or metadata addresses.

## InfluxDB 3 product docs (per flavor)

| Flavor | URL | When to fetch |
|---|---|---|
| Core | https://docs.influxdata.com/influxdb3/core/ | Default for self-hosted single-node setups; Core-specific config and admin |
| Enterprise | https://docs.influxdata.com/influxdb3/enterprise/ | Multi-node, replication, resource tokens |
| Core release notes | https://docs.influxdata.com/influxdb3/core/release-notes/ | Target and intervening releases; preserve edition and version qualifiers |
| Enterprise release notes | https://docs.influxdata.com/influxdb3/enterprise/release-notes/ | Enterprise-specific changes plus inherited Core updates |
| Enterprise databases | https://docs.influxdata.com/influxdb3/enterprise/admin/databases/ | Existing explicit schemas and separately scoped declaration work |
| Enterprise users | https://docs.influxdata.com/influxdb3/enterprise/admin/security/manage-users/ | User authentication and role administration beyond token workflows |
| Cloud Serverless | https://docs.influxdata.com/influxdb3/cloud-serverless/ | Cloud-Serverless–specific endpoints, auth, write path quirks |
| Cloud Dedicated | https://docs.influxdata.com/influxdb3/cloud-dedicated/ | Dedicated cluster setup, custom hosts |
| InfluxDB 3 Cloud | https://docs.influxdata.com/influxdb3/cloud/ | Hosted Enterprise: confirm API and token behavior |
| Cloud Serverless regions | https://docs.influxdata.com/influxdb3/cloud-serverless/reference/regions/ | Region host URLs |
| Enterprise CLI reference | https://docs.influxdata.com/influxdb3/enterprise/reference/cli/influxdb3/create/ | `create database`, `create token`, and other CLI commands |
| Enterprise HTTP API reference | https://docs.influxdata.com/influxdb3/enterprise/api/v3/ | Canonical `/api/v3/*` endpoints and bodies |
| Preconfigured admin token | https://docs.influxdata.com/influxdb3/enterprise/admin/tokens/admin/preconfigured/ | Start the server with an admin token file |

## Topics this skill defers

Use these URLs in the deferral replies that SKILL.md §9 describes. Link the page for the developer's product: replace `core` with `enterprise` for InfluxDB 3 Enterprise.

| Topic | URL |
|---|---|
| Migration from v1 or v2 | https://docs.influxdata.com/influxdb3/core/get-started/migrate-from-influxdb-v1-v2/ |
| Performance tuning | https://docs.influxdata.com/influxdb3/core/admin/performance-tuning/ |
| Air-gapped plugin setup | https://docs.influxdata.com/influxdb3/core/plugins/ → "Disable package installation for secure environments" |

## Spec-level references

| Topic | URL | When to fetch |
|---|---|---|
| Line protocol | https://docs.influxdata.com/influxdb3/core/reference/syntax/line-protocol/ | Edge cases on quoting, escaping, type coercion |
| SQL reference | https://docs.influxdata.com/influxdb3/core/reference/sql/ | v3 SQL syntax details and supported functions |
| InfluxQL reference | https://docs.influxdata.com/influxdb3/core/reference/influxql/ | When the developer uses InfluxQL |
| HTTP API (`/api/v3/*`) | https://docs.influxdata.com/influxdb3/core/reference/api/ | Endpoint paths, request/response shapes |
| `/ping` endpoint | https://docs.influxdata.com/influxdb3/core/reference/api/#ping | Flavor detection details |

## Official client libraries (GitHub)

| Language | URL | When to fetch |
|---|---|---|
| Python | https://github.com/InfluxCommunity/influxdb3-python | API surface, `Point`, batching options, current release notes |
| JavaScript / TypeScript | https://github.com/InfluxCommunity/influxdb3-js | Same |
| Go | https://github.com/InfluxCommunity/influxdb3-go | Same |
| Java | https://github.com/InfluxCommunity/influxdb3-java | Same |
| C# | https://github.com/InfluxCommunity/influxdb3-csharp | Same |
