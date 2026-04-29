# Curated Documentation URLs

When the skill content does not cover a developer's question — or when the answer might be version-sensitive — Claude is allowed to WebFetch from this list. **Do not invent URLs that aren't on this list.** If you need a doc that's not here, ask the developer for the URL or note that the answer requires fresh research.

## InfluxDB 3 product docs (per flavor)

| Flavor | URL | When to fetch |
|---|---|---|
| Core | https://docs.influxdata.com/influxdb3/core/ | Default for self-hosted single-node setups; Core-specific config and admin |
| Enterprise | https://docs.influxdata.com/influxdb3/enterprise/ | Multi-node, replication, RBAC |
| Cloud Serverless | https://docs.influxdata.com/influxdb3/cloud-serverless/ | Cloud-Serverless–specific endpoints, auth, write path quirks |
| Cloud Dedicated | https://docs.influxdata.com/influxdb3/cloud-dedicated/ | Dedicated cluster setup, custom hosts |

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

## Last verified

This URL list was last verified on **2026-04-29**. If you find a broken link, log it in `evals/results/` and update this file as part of the next quarterly refresh.
