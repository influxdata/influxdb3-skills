# Flavor Detection via `/ping`

Most code can stay flavor-agnostic by reading host and token from env vars. When the generated code genuinely needs flavor-specific logic (different write endpoints, different retention-period endpoints, etc.), use the `/ping` probe to detect the flavor.

This logic follows the detection that InfluxDB 3 Explorer uses to distinguish each product.

---

## Products Explorer Recognizes

| Internal Key | Display Name | Notes |
|---|---|---|
| `CORE` | InfluxDB 3 Core | Self-hosted, free, single-node |
| `ENTERPRISE` | InfluxDB 3 Enterprise | Self-hosted, licensed, multi-node |
| `CLOUD_SERVERLESS` | InfluxDB Cloud Serverless | InfluxData-hosted, multi-tenant |
| `CLOUD_DEDICATED` | InfluxDB Cloud Dedicated | InfluxData-hosted, single-tenant |
| `CLUSTERED` | InfluxDB Clustered | Self-hosted, Kubernetes, multi-node |

> Note: Explorer does **not** attempt to detect InfluxDB OSS 1.x or 2.x in this flow. Those product lines use different endpoints and are outside Explorer's scope.

---

## Decision Flow

Explorer runs up to six sequential checks. The first check that matches wins; later checks are skipped.

```
1. GET <host>/ping  (no token — pure connectivity check)
   ├─ 200 OK        → proceed
   ├─ 401           → treat as 200 (token required; server is up; continue)
   ├─ 500           → abort: ServerError
   └─ network/other → abort: InvalidUrl

2. GET <host>/ping  (with token in Authorization: Bearer header)
   Check response header: x-influxdb-build
   ├─ contains "Enterprise" (case-insensitive) → ENTERPRISE  ✓  stop
   ├─ contains "Core"       (case-insensitive) → CORE        ✓  stop
   ├─ contains "cloud"      (case-insensitive) → not Core/Enterprise; fall through
   ├─ header absent, token gave 401            → abort: InvalidTokenCore
   ├─ header absent, token gave 403            → continue to step 3 (resource token)
   └─ header absent, token gave 200            → continue to step 3 (no build header)

   Note: x-influxdb-version and cluster-uuid are also captured from this response
   for informational purposes but are not used in the branch decision here.

3. If step 2 produced no build header (resource token or no header):
   GET <host>/api/v3/configure/retention_period  (Core strategy, with token)
   ├─ 404 Not Found  → CORE       ✓  stop  (Core 3.12.1 returns 404)
   ├─ 403 Forbidden  → ENTERPRISE ✓  stop  (endpoint exists but token lacks permission)
   ├─ 200 (success)  → abort: UnableToDetermineCore (unexpected)
   └─ other          → abort: UnexpectedStatusCodeCore
   Fallback: if step 3 itself errors, re-examine x-influxdb-build from step 1 ping.

4. GET <serverless-databases-endpoint>  (Cloud Serverless strategy, with token)
   ├─ 200 → CLOUD_SERVERLESS  ✓  stop
   ├─ 401 → abort: InvalidTokenServerless
   ├─ 403 → abort: InvalidTokenServerless
   └─ other → not Serverless; fall through

5. URL pattern check (Cloud Dedicated)
   Does the host URL contain "influxdb.io"?
   ├─ NO  → skip to step 6
   └─ YES → validate all supplied database names via query
             ├─ all valid → CLOUD_DEDICATED  ✓  stop
             └─ any invalid → abort: DatabaseValidationFailed

6. Clustered: validate all supplied database names via query
   ├─ at least one valid → CLUSTERED  ✓  stop
   └─ none valid        → abort: NoValidDatabasesClustered

If all six checks fail → abort: UnableToDetect
```

**Priority order summary:** Core/Enterprise (build header) → Core/Enterprise (retention probe) → Cloud Serverless → Cloud Dedicated (URL + DB) → Clustered (DB).

---

## Patterns

### Step 2: `x-influxdb-build` Response Header (Primary Signal)

| Header value (case-insensitive substring) | Detected flavor |
|---|---|
| Contains `"Enterprise"` | InfluxDB 3 Enterprise |
| Contains `"Core"` | InfluxDB 3 Core |
| Contains `"cloud"` | Not Core/Enterprise; move to Serverless check |
| Absent | Move to retention-period probe (step 3) |

**Where:** HTTP response header on `GET /ping` (with token).  
**Rationale:** Explorer matches these values with a case-insensitive substring check.

### Step 3: Retention-Period Endpoint Probe (Secondary Signal for Core vs Enterprise)

| HTTP status on `GET /api/v3/configure/retention_period` | Detected flavor |
|---|---|
| `404 Not Found` | InfluxDB 3 Core |
| `403 Forbidden` | InfluxDB 3 Enterprise |

**Rationale:** Core does not implement the retention-period configuration endpoint (returns 404); Enterprise exposes it but resource tokens lack access (returns 403).

### Step 4: Cloud Serverless — Database List Endpoint

Successfully listing databases using the Cloud Serverless API base URL identifies the server as Cloud Serverless. A 401 or 403 from this endpoint means the token is wrong for Serverless (abort); any other error means it is not Serverless.

### Step 5: Cloud Dedicated — URL Pattern

| Host URL substring | Detected flavor |
|---|---|
| Contains `"influxdb.io"` | InfluxDB Cloud Dedicated (if DBs validate) |

**Rationale:** Explorer treats hosts that contain `influxdb.io` as Cloud Dedicated. Database names must be supplied and verified before the label is assigned.

### Step 6: Clustered — Fallback

If the host URL does not match the Cloud Dedicated pattern but database names are provided and at least one validates successfully, the server is labeled InfluxDB Clustered.

---

## Additional Headers Captured (Informational)

These headers are extracted from the `/ping` response and surfaced in Explorer's connection result, but they are not used as branch conditions in the detection logic:

| Header | Description |
|---|---|
| `x-influxdb-version` | Server version string, e.g. `"3.12.1"` |
| `cluster-uuid` | Cluster identifier (Enterprise/Clustered only) |

The `/ping` JSON body also includes `version`.

---

## Reference Snippets

### Python

```python
import requests


def detect_flavor(host: str, token: str) -> str | None:
    """
    Probe <host>/ping and apply Explorer's flavor-detection logic.

    Returns one of:
        "InfluxDB 3 Core"
        "InfluxDB 3 Enterprise"
        "InfluxDB Cloud Serverless"
        "InfluxDB Cloud Dedicated"
        "InfluxDB Clustered"
        None  -- when the flavor cannot be determined automatically

    Raises:
        RuntimeError  -- when the server is unreachable or returns a 5xx error
    """
    host = host.rstrip("/")
    ping_url = f"{host}/ping"
    headers_with_token = {"Authorization": f"Bearer {token}"}

    # Step 1: bare connectivity check (no token)
    try:
        r0 = requests.get(ping_url, timeout=10)
        if r0.status_code == 500:
            raise RuntimeError(f"Server returned 500 on /ping")
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Cannot reach {ping_url}: {exc}") from exc

    # Step 2: ping with token — inspect x-influxdb-build header
    try:
        r1 = requests.get(ping_url, headers=headers_with_token, timeout=10)
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Request failed: {exc}") from exc

    if r1.status_code == 401:
        # Bad token for Core/Enterprise
        return None
    if r1.status_code == 500:
        raise RuntimeError("Server returned 500 during authenticated ping")

    build = r1.headers.get("x-influxdb-build", "").lower()

    if "enterprise" in build:
        return "InfluxDB 3 Enterprise"
    if "core" in build:
        return "InfluxDB 3 Core"
    # "cloud" in build → skip to serverless check below
    # absent build header and 403 → also fall through to retention probe

    if not build or "cloud" not in build:
        # Step 3: retention-period probe to distinguish Core vs Enterprise
        # (used when the build header is absent, e.g. resource token gave 403)
        retention_url = f"{host}/api/v3/configure/retention_period"
        try:
            r2 = requests.get(
                retention_url, headers=headers_with_token, timeout=10
            )
            if r2.status_code == 404:
                return "InfluxDB 3 Core"
            if r2.status_code == 403:
                return "InfluxDB 3 Enterprise"
            # 200 or other unexpected status → ambiguous; fall through
        except requests.exceptions.RequestException:
            pass  # probe failed; fall through

    # Step 4: Cloud Serverless — host pattern. Cloud Serverless has no
    # /api/v3 endpoints, so these snippets check the documented host instead.
    if "cloud2.influxdata.com" in host:
        return "InfluxDB Cloud Serverless"

    # Step 5: Cloud Dedicated — URL pattern
    if "influxdb.io" in host:
        return "InfluxDB Cloud Dedicated"

    # Step 6: Clustered — cannot validate databases without names; signal ambiguity
    return None
```

### JavaScript (Node / fetch)

```javascript
/**
 * Probe <host>/ping and apply Explorer's flavor-detection logic.
 *
 * Returns one of:
 *   "InfluxDB 3 Core"
 *   "InfluxDB 3 Enterprise"
 *   "InfluxDB Cloud Serverless"
 *   "InfluxDB Cloud Dedicated"
 *   "InfluxDB Clustered"
 *   null  -- when the flavor cannot be determined automatically
 *
 * Throws when the server is unreachable or returns a 5xx error.
 *
 * @param {string} host   - e.g. "http://localhost:8181"
 * @param {string} token  - InfluxDB API token
 * @returns {Promise<string|null>}
 */
async function detectFlavor(host, token) {
  const baseHost = host.replace(/\/$/, "");
  const pingUrl = `${baseHost}/ping`;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Step 1: bare connectivity check (no token)
  let bareResp;
  try {
    bareResp = await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw new Error(`Cannot reach ${pingUrl}: ${err.message}`);
  }
  if (bareResp.status === 500) {
    throw new Error("Server returned 500 on /ping");
  }

  // Step 2: ping with token — inspect x-influxdb-build header
  let r1;
  try {
    r1 = await fetch(pingUrl, {
      headers: authHeaders,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`Authenticated ping failed: ${err.message}`);
  }

  if (r1.status === 401) {
    return null;
  }
  if (r1.status === 500) {
    throw new Error("Server returned 500 during authenticated ping");
  }

  const build = (r1.headers.get("x-influxdb-build") || "").toLowerCase();

  if (build.includes("enterprise")) {
    return "InfluxDB 3 Enterprise";
  }
  if (build.includes("core")) {
    return "InfluxDB 3 Core";
  }

  if (!build || !build.includes("cloud")) {
    // Step 3: retention-period probe to distinguish Core vs Enterprise
    const retentionUrl = `${baseHost}/api/v3/configure/retention_period`;
    try {
      const r2 = await fetch(retentionUrl, {
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });
      if (r2.status === 404) {
        return "InfluxDB 3 Core";
      }
      if (r2.status === 403) {
        return "InfluxDB 3 Enterprise";
      }
    } catch {
      // probe failed; fall through
    }
  }

  // Step 4: Cloud Serverless — host pattern. Cloud Serverless has no
  // /api/v3 endpoints, so these snippets check the documented host instead.
  if (baseHost.includes("cloud2.influxdata.com")) {
    return "InfluxDB Cloud Serverless";
  }

  // Step 5: Cloud Dedicated — URL pattern
  if (baseHost.includes("influxdb.io")) {
    return "InfluxDB Cloud Dedicated";
  }

  // Step 6: Clustered — cannot validate databases without names; signal ambiguity
  return null;
}
```

---

## Fallback to Asking

When detection returns `None` / `null`, ask which product the developer targets: Core, Enterprise, InfluxDB 3 Cloud, Cloud Serverless, Cloud Dedicated, or Clustered. For Cloud Dedicated and Clustered you will also need one or more database names to validate the connection.

