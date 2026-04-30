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

Quoting: string field values are wrapped in double quotes (`status="ok"`), tag values are not. Escape commas, equals, and spaces in tag/field keys and tag values with `\`.

Full spec: see `references/doc-urls.md` → "Line protocol".

## Batching rule

**Batch ≥ 1,000 points or flush every 1 second**, whichever comes first. The official clients have batching helpers — use them. Avoid one-write-per-point loops; they hammer the server and run out of HTTP connections fast.

For real-time streams, prefer the client's built-in batch-and-flush helper. For bulk loads, build a list of N points (start with 1,000–10,000) and write the list in one call.

## Error handling

| Status | Meaning | Retriable? |
|---|---|---|
| 200 / 204 | Success | n/a |
| 400 | Line protocol parse error or schema-type conflict | **No** — fix the data and retry |
| 401 | Auth failed | **No** — fix the token |
| 404 | Database not found | **No** — create the DB or fix the env var |
| 413 | Payload too large | **No** — reduce batch size |
| 429 | Rate limited | **Yes** — exponential backoff with jitter |
| 5xx | Server side | **Yes** — backoff with jitter |

A 400 from a single bad line in a batch will reject the **whole batch** in v3. Either pre-validate, or split-and-retry on 400 to find the bad row.

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
