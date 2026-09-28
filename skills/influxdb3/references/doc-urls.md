# Curated Documentation URLs

When the skill content does not cover a developer's question — or when the answer might be version-sensitive — fetch from this list. **Do not invent URLs that aren't on this list.** If you need a doc that's not here, ask the developer for the URL or note that the answer requires fresh research.

> **This is an advisory allowlist, not an enforced egress control.** Nothing in the skill or harness parses this file to block other destinations — it's a rule a cooperating agent follows, and deviations should be conspicuous. When honoring it, match the **exact host** (`docs.influxdata.com`, `github.com`): reject lookalikes that merely *contain* an allowed host — a suffix (`docs.influxdata.com.evil.example`), a `user@` prefix (`docs.influxdata.com@evil.example`), a subdomain you didn't expect, or a raw IP literal. Never fetch internal/link-local or cloud-metadata addresses (e.g. `169.254.169.254`, `localhost`, RFC1918 ranges). If actual egress restriction matters for your deployment, enforce it at the harness/network layer — this list cannot.

## InfluxDB 3 product docs (per flavor)

| Flavor | URL | When to fetch |
|---|---|---|
| Core | https://docs.influxdata.com/influxdb3/core/ | Default for self-hosted single-node setups; Core-specific config and admin |
| Enterprise | https://docs.influxdata.com/influxdb3/enterprise/ | Multi-node, replication, resource tokens |
| Cloud Serverless | https://docs.influxdata.com/influxdb3/cloud-serverless/ | Cloud-Serverless–specific endpoints, auth, write path quirks |
| Cloud Dedicated | https://docs.influxdata.com/influxdb3/cloud-dedicated/ | Dedicated cluster setup, custom hosts |

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
| InfluxQL reference | https://docs.influxdata.com/influxdb3/core/reference/influxql/ | Only when the user explicitly needs v1/v2 compatibility |
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
