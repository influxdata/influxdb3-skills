# Schema Design for InfluxDB 3

## The tag-vs-field decision

For each value you're considering writing:

| Question | If yes → | If no → |
|---|---|---|
| Will I `GROUP BY` or filter on this? | candidate for tag | field |
| Does it have a small, bounded set of distinct values (typically ≤ a few thousand)? | tag | field |
| Is it a measured quantity that varies over time? | field | tag |
| Is it a unique identifier (UUID, request ID, user ID)? | **field**, not tag | — |

Default: **when in doubt, make it a field.** It's cheaper to add a tag later than to recover from a high-cardinality blowup.

## Cardinality — the most common mistake

Tags create indexed series. The total number of unique tag-value combinations is your **series cardinality**. High cardinality blows up storage and slows queries.

Common offenders that should be **fields, not tags**:

- User IDs, customer IDs, account IDs
- Request IDs, trace IDs, transaction IDs
- UUIDs of any kind
- IP addresses (in most apps)
- GPU IDs, device IDs (in fleet-scale telemetry)

Common values that **should** be tags:

- `region` (small set: us-east, us-west, …)
- `host` (bounded by your fleet size, typically OK; once you exceed ~100k unique hosts in a single series, reconsider)
- `service`, `env`, `tier`
- `status` (typically a small enum)

### The 50,000-GPU example

If a developer asks "how do I track GPU utilization across 50,000 GPUs?", and they propose `gpu_id` as a tag, push back:

> "50,000 unique tag values per measurement is a high cardinality. If you also tag by region (4) and host (10,000), your series count multiplies. Make `gpu_id` a **field** instead, and tag only by low-cardinality dimensions like `region` or `gpu_model`."

## Naming conventions

- **snake_case** for measurement, tag, and field names. No spaces.
- **Singular** measurement names: `cpu`, not `cpus`; `request`, not `requests`.
- Avoid SQL reserved words (`time`, `value`, `select`, …). When unavoidable, quote with double quotes in queries.
- Be consistent across measurements. If `host` is a tag in `cpu`, it should be a tag (not a field) in `memory` too.

## One measurement vs many

Group related measurements that share tag schema into one measurement with a `metric_kind` field, OR keep them as separate measurements. The former simplifies fan-out queries; the latter simplifies retention policies. There's no single right answer — but pick one and apply it consistently.

## Schema evolution

Adding new tags or fields to an existing measurement is safe — old rows just have NULLs in the new columns. Changing a field's **type** is not safe (see `references/writing.md` → "Type stickiness"). Removing a tag/field doesn't drop existing data; it just stops new writes from using it.

## Where to fetch more

`references/doc-urls.md` → product flavor docs for schema details specific to your deployment.
