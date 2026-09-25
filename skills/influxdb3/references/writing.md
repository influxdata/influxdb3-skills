# Writing Data to InfluxDB 3

## Line protocol — one paragraph

Line protocol is a plain-text format: one line per point. Format:

```
<measurement>,<tag_key>=<tag_value>[,…] <field_key>=<field_value>[,…] [<timestamp>]
```

Example:

```
sensor,host=server01,region=us-west temperature=72.4,humidity=45.1 1714400000
```

Spaces separate the three sections. Commas separate tags within section 1 and fields within section 2. Timestamp is optional; the server stamps "now" if omitted (use this only for live writes — backfills must include explicit timestamps).

Quoting: string field values are wrapped in double quotes (`status="ok"`), tag values are not. Escape commas, equals, and spaces in tag/field keys and tag values with `\`; escape double quotes and backslashes inside string field values with `\`.

**Constructing line protocol from untrusted values is injection-prone — a newline is a record separator.** If you hand-build line protocol by interpolating a tag or field value that contains a literal newline (`\n`) or carriage return (`\r`), everything after it is parsed as a *second point* — a value like `"ok\nmalicious,host=x value=1"` forges an extra record. Line protocol has no escape for `\n`/`\r`, so a value that may contain them cannot be safely written raw. Prefer an official client's builder (Python `Point`, or `LineBuilder` in the plugins runtime), which escapes the structural characters it can; for values that might contain `\n`/`\r`, **reject or strip them before writing** rather than relying on escaping. This matters most for whole-batch writes, where per-line partial acceptance means a `400` on a later line doesn't undo an already-parsed forged point.

Full spec: see `references/doc-urls.md` → "Line protocol".

## Batching rule

**Batch ≥ 1,000 points or flush every 1 second**, whichever comes first. The official clients have batching helpers — use them. Avoid one-write-per-point loops; they hammer the server and run out of HTTP connections fast.

For real-time streams, prefer the client's built-in batch-and-flush helper. For bulk loads, build a list of N points (start with 1,000–10,000) and write the list in one call.

## Error handling

| Status | Meaning | Retriable? |
|---|---|---|
| 200 / 204 | Success | n/a |
| 400 | Line protocol parse error or schema-type conflict | **No** — fix the rejected lines and resend (see below for which lines) |
| 401 | Auth failed | **No** — fix the token |
| 403 | Token is valid but lacks write permission for the database | **No** — use a token with `write` on that database |
| 404 | Database not found | **No** — create the DB or fix the env var |
| 413 | Payload too large | **No** — reduce batch size |
| 429 | Rate limited | **Yes** — exponential backoff with jitter |
| 5xx | Server side | **Yes** — backoff with jitter |
| No response (connection reset or refused) | The node is stopped or unreachable | **Yes** — back off, or send to another node |

Before Core and Enterprise 3.10.0, `/api/v2/write` returned 401, not 403, for a valid token that lacks permission.
Handle both codes as "fix the token."

### A 400 can mean a partial write

`/api/v3/write_lp` accepts partial writes by default (`accept_partial=true`).
InfluxDB writes the valid lines, rejects the invalid ones, and returns 400.
The response body lists each rejected line with its line number.
After a partial write, the valid lines are already stored.
Resend only the corrected rejected lines, not the whole batch.

With `accept_partial=false`, one invalid line rejects the whole batch.

The `/api/v2/write` and `/write` compatibility endpoints behave differently.
On Core and Enterprise 3.11.5, one invalid line in the batch returns 400, and none of the lines are written.
Fix the invalid line and resend the whole batch.
The v1 compatibility route is `/write`, not `/api/v1/write`.

### Official clients write through `/api/v2/write` by default

The official InfluxDB 3 clients send writes to the V2 API endpoint (`/api/v2/write`) by default, starting in these releases.
So by default, one invalid line rejects the whole batch, and `accept_partial` has no effect.

| Client | V2 default starting in | Write through `/api/v3/write_lp` instead |
|---|---|---|
| `influxdb3-python` | 0.20.0 | `write_use_v2_api=False` (or `WriteOptions(use_v2_api=False)`) |
| `@influxdata/influxdb3-client` (JavaScript) | 2.3.0 | `useV2Api: false` in `writeOptions` or per-write options |
| `influxdb3-go` | 2.15.0 (2.14.0 defaulted to the V3 endpoint) | `UseV2Api` write option set to `false` |
| `influxdb3-java` | 1.10.0 | `useV2Api` write option set to `false` |
| `InfluxDB3.Client` (C#) | 1.9.0 | `UseV2Api` write option set to `false` |

The Python and JavaScript clients also read the `INFLUX_WRITE_USE_V2_API` environment variable.
`no_sync` (`noSync`, `NoSync`) requires the V3 endpoint in every client.
For InfluxDB 3 Core and Enterprise, opt into the V3 endpoint when you need partial writes or `no_sync`.
Keep the default for InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered.
Check the client's README for the exact option syntax in the version the user runs.

Match on the status code and the `data` array, not on the error message text.
The message text differs between the docs and some releases.

### Duplicate tag keys

A point that repeats a tag key, such as `m,t=a,t=a f=1i`, returns 400.
Core and Enterprise reject it in 3.9.8+, 3.10.3+, and 3.11.0+.
Earlier releases accepted the point, and the node then crash-looped on WAL replay.
If the user runs an earlier version, validate tag keys client-side before writing.

### `influxdb3 write` in scripts

`influxdb3 write` prints a throughput report on success (3.10.0+); earlier releases print `success`.
Scripts that parse the output for `success` break.
Add `--quiet` (`-q`) to suppress all output, and don't parse the report.

For symptom-by-symptom diagnosis, see `references/troubleshooting.md` → "Write failures".

## Type stickiness

Once a field is a float, you cannot write a string to that same field name later — the schema infers types per-field on first write. To recover, either pick a different field name (`temperature_f` instead of `temperature`) or drop and recreate the table.

Tags are always strings; mixing types into a tag silently coerces to string.

## Backfilling vs. live writes

- **Live writes:** omit the timestamp; the server stamps "now". Cheaper.
- **Backfills:** always include explicit timestamps. Use second precision (`?precision=second`) by default unless you genuinely need sub-second resolution — it makes line protocol smaller and queries faster.

## When to use raw HTTP vs the client

The official clients give you batching, retries, and friendlier error messages for free. Use raw HTTP only when:

- You're in a language without a first-class client.
- You need to integrate with an existing HTTP request pipeline.
- You're benchmarking the wire path.

See `references/clients/http.md`.
