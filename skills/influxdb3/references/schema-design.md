# Schema design for InfluxDB 3

## The tag-vs-field decision

- **Tags** hold metadata that identifies the data's source or context: `host`, `region`, `sensor_id`, `gpu_id`.
- **Fields** hold measured values: temperature, utilization, latency.
- Tag values are always strings. Field values can be integers, unsigned integers, floats, strings, or booleans.

InfluxDB 3 identifies a point by its table, its tag set, and its timestamp.
Fields aren't part of that identity.
Points with the same identity merge into one, and InfluxDB doesn't guarantee which value it keeps for a field they share.
So a value that tells data sources apart must be a tag, even when it's unique per device.
For example, if `gpu_id` were a field, GPUs on the same host reporting at the same timestamp would overwrite each other.
For rewrite and retry safety, see [`references/quirks.md` entry 13](quirks.md#13-overwriting-a-point-isnt-deterministic).

## Cardinality

The InfluxDB 3 storage engine supports unlimited tag value and series cardinality.
Unlike InfluxDB v1 and v2, a tag with many distinct values, such as a device ID, doesn't slow the database down.
Don't move identifiers into fields to reduce cardinality. That advice applies to InfluxDB v1 and v2, not InfluxDB 3.

## Naming conventions

- **snake_case** for measurement, tag, and field names. No spaces.
- **Singular** measurement names: `cpu`, not `cpus`; `request`, not `requests`.
- Avoid SQL reserved words (`time`, `value`, `select`, …). When unavoidable, quote with double quotes in queries.
- Be consistent across measurements. If `host` is a tag in `cpu`, make it a tag (not a field) in `memory` too.

## One measurement vs many

Group related measurements that share tag schema into one measurement with a `metric_kind` tag, or keep them as separate measurements. The former simplifies fan-out queries; the latter keeps each measurement's schema narrow. Either works. Pick one and use it consistently.

## Schema evolution

Adding new tags or fields to an existing measurement is safe — old rows just have NULLs in the new columns. Changing a field's **type** is not safe (see [`references/writing.md` → "Type stickiness"](writing.md#type-stickiness)).

Schema-on-write applies to implicit-schema databases.
An Enterprise database in explicit-schema mode rejects undeclared tables and columns.
If the developer encounters that error, check the existing schema and route declaration work to the [Enterprise schema guide](https://docs.influxdata.com/influxdb3/enterprise/admin/databases/).
Don't tell an application to create columns by writing them or turn off enforcement.

## Where to fetch more

[Schema design best practices](https://docs.influxdata.com/influxdb3/core/write-data/best-practices/schema-design/) (same page under `/influxdb3/enterprise/`), including table and column limits.
