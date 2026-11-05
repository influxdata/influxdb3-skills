# Flavor Detection via `/ping`

Most code can stay flavor-agnostic by reading host and token from env vars. When the generated code genuinely needs flavor-specific logic (different write endpoints, different retention-period endpoints, etc.), use the `/ping` probe to detect the flavor.

This logic follows the first steps of the detection that InfluxDB 3 Explorer uses.
Those steps identify Core and Enterprise. Explorer's later steps identify products this skill doesn't cover, so they're left out here.

---

## Identify the product

Identify the product before you answer a question about a hosted service or a host you haven't probed.
"InfluxDB Cloud" alone can mean InfluxDB 3 Cloud, InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, InfluxDB Cloud (TSM), or InfluxDB Cloud 1.
These signals come from the docs' [InfluxDB version detector](https://docs.influxdata.com/influxdb3/core/admin/identify-version/).
Use the first one that matches.

| Signal | Product | This skill |
|---|---|---|
| Host ends in `enterprise.influxdb.io` | InfluxDB 3 Cloud | Covered |
| Host ends in `a.influxdb.io` | InfluxDB Cloud Dedicated | Route to its docs |
| Host is `us-east-1-1.aws.cloud2.influxdata.com` or `eu-central-1-1.aws.cloud2.influxdata.com` | InfluxDB Cloud Serverless | Route to its docs |
| Host is in another `cloud2.influxdata.com` region | InfluxDB Cloud (TSM) | Route to its docs |
| Host contains `influxcloud.net` | InfluxDB Cloud 1 | Route to its docs |
| `/ping` returns `x-influxdb-version` starting with `3.` and `x-influxdb-build: Core` or `Enterprise` | InfluxDB 3 Core or Enterprise | Covered. See the decision flow. |
| `/ping` returns `x-influxdb-version: influxqlbridged-development` | InfluxDB Clustered | Route to its docs |
| `/ping` returns `x-influxdb-version` starting with `1.` or `2.` | InfluxDB OSS v1 or v2, or InfluxDB Enterprise v1 | Route to its docs |

Port `8181` suggests InfluxDB 3 Core or Enterprise, and port `8086` suggests InfluxDB OSS v1 or v2.
The query language narrows it too: SQL rules out InfluxDB v1 and v2, and Flux rules out InfluxDB 3 Core, Enterprise, and InfluxDB 3 Cloud.
If no signal matches, ask which product the developer uses.
Route each product to its docs in [`doc-urls.md`](doc-urls.md).

---

## Decision Flow

Run these checks in order. The first check that matches wins; later checks are skipped.
If no check matches, don't guess. Have the code return an unknown result, and ask the developer which product they target or read it from configuration (see "Fallback to Asking").

```
1. GET <host>/ping  (no token — pure connectivity check)
   ├─ 200 OK        → proceed
   ├─ 401           → treat as 200 (token required; server is up; continue)
   ├─ 500           → abort: ServerError
   └─ network/other → abort: InvalidUrl

2. GET <host>/ping  (with token in Authorization: Bearer header)
   Check response header: x-influxdb-build
   ├─ x-influxdb-version present and not "3.*" → not InfluxDB 3; go to step 4
   │    (InfluxDB Enterprise v1 also sends x-influxdb-build: Enterprise)
   ├─ contains "Enterprise" (case-insensitive) → ENTERPRISE  ✓  stop
   ├─ contains "Core"       (case-insensitive) → CORE        ✓  stop
   ├─ contains "cloud"      (case-insensitive) → not Core or Enterprise; go to step 4
   ├─ header absent, token gave 401            → abort: InvalidTokenCore
   ├─ header absent, token gave 403            → continue to step 3 (resource token)
   └─ header absent, token gave 200            → continue to step 3 (no build header)

   Note: cluster-uuid is also captured from this response
   for informational purposes but is not used in the branch decision here.

3. If step 2 produced no build header (resource token or no header):
   GET <host>/api/v3/configure/retention_period  (Core strategy, with token)
   ├─ 404 Not Found  → CORE       ✓  stop
   ├─ 403 Forbidden  → ENTERPRISE ✓  stop  (endpoint exists but token lacks permission)
   ├─ 200 (success)  → abort: UnableToDetermineCore (unexpected)
   └─ other          → abort: UnexpectedStatusCodeCore
   Fallback: if step 3 itself errors, re-examine x-influxdb-build from step 1 ping.

4. Not Core or Enterprise (a non-3.x version, a build header containing "cloud",
   or step 3 didn't match):
   Stop. Identify the product with "Identify the product" above, or ask.
   Route each product this skill doesn't cover to its docs.
```

**Priority order summary:** build header, then the retention-period probe, then ask.

---

## Patterns

### Step 2: `x-influxdb-build` Response Header (Primary Signal)

| Header value (case-insensitive substring) | Detected flavor |
|---|---|
| Contains `"Enterprise"` | InfluxDB 3 Enterprise |
| Contains `"Core"` | InfluxDB 3 Core |
| Contains `"cloud"` | Not Core or Enterprise; stop and ask (step 4) |
| Absent | Move to retention-period probe (step 3) |

**Where:** HTTP response header on `GET /ping` (with token).  
**Rationale:** Explorer matches these values with a case-insensitive substring check.

### Step 3: Retention-Period Endpoint Probe (Secondary Signal for Core vs Enterprise)

| HTTP status on `GET /api/v3/configure/retention_period` | Detected flavor |
|---|---|
| `404 Not Found` | InfluxDB 3 Core |
| `403 Forbidden` | InfluxDB 3 Enterprise |

**Rationale:** Core does not implement the retention-period configuration endpoint (returns 404); Enterprise exposes it but resource tokens lack access (returns 403).

---

## Additional Headers Captured (Informational)

These headers are extracted from the `/ping` response and surfaced in Explorer's connection result.
Step 2 uses `x-influxdb-version` only to rule out servers that aren't InfluxDB 3:

| Header | Description |
|---|---|
| `x-influxdb-version` | Server version string, e.g. `"3.12.1"` |
| `cluster-uuid` | Cluster identifier (Enterprise only) |

The `/ping` JSON body also includes `version`.

---

## Fallback to Asking

When detection returns `None` / `null`, ask which product the developer targets: Core, Enterprise, InfluxDB 3 Cloud, or another product. Route other products to their docs.

