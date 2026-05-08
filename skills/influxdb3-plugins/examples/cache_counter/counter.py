"""Cache counter example for InfluxDB 3 Processing Engine.

Trigger spec: every:30s

Increments a trigger-local counter on each invocation, writes the value
back as a measurement, and demonstrates put/get/delete with TTL.

Demonstrates:
- influxdb3_local.cache.get(key, default=...)
- influxdb3_local.cache.put(key, value)
- influxdb3_local.cache.put(key, value, ttl=...)
- influxdb3_local.cache.delete(key)
- the trigger-local namespace (default; isolated per trigger)
"""


def process_scheduled_call(influxdb3_local, call_time, args=None):
    # 1. Counter pattern with default-on-miss
    counter = influxdb3_local.cache.get("count", default=0)
    counter += 1
    influxdb3_local.cache.put("count", counter)

    # 2. Cache a TTL-bound value (example only — real plugins would cache
    #    something useful here, like an external API response).
    influxdb3_local.cache.put("last_seen_iso", call_time.isoformat(), ttl=120)

    # 3. Demonstrate delete on a separate key
    influxdb3_local.cache.put("temp", "delete-me")
    deleted = influxdb3_local.cache.delete("temp")

    influxdb3_local.info(
        f"counter={counter} last_seen={call_time.isoformat()} "
        f"temp_delete={'ok' if deleted else 'miss'}"
    )

    line = (LineBuilder("plugin_counter")
            .tag("plugin", "cache_counter")
            .int64_field("count", counter))
    influxdb3_local.write(line)
