# Schema Design for InfluxDB 3

## The tag-vs-field decision

InfluxDB 3 identifies a row by its table, its tag set, and its timestamp.
Fields aren't part of that identity.

- **Tags** hold metadata that identifies the data's source or context: `host`, `region`, `sensor_id`, `gpu_id`.
- **Fields** hold measured values: temperature, utilization, latency.
- Tag values are always strings. Field values can be integers, unsigned integers, floats, strings, or booleans.

Two points with the same table, tag set, and timestamp are the same row, and the later write overwrites the earlier one.
So a value that tells two data sources apart must be a tag, even when it's unique per device.

## Cardinality

The InfluxDB 3 storage engine supports unlimited tag value and series cardinality.
Unlike InfluxDB v1 and v2, a tag with many distinct values, such as a device ID, doesn't slow the database down.
Don't move identifiers into fields to reduce cardinality. That advice applies to InfluxDB v1 and v2, not InfluxDB 3.

### The 50,000-GPU example

For "how do I track GPU utilization across 50,000 GPUs?", make `gpu_id` a tag, along with `host` and `region`.
Several GPUs on one host report at the same timestamp.
If `gpu_id` were a field, their points would share a tag set and timestamp, and each write would overwrite the last.

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
