"""Hello-world HTTP request plugin for InfluxDB 3 Processing Engine.

Trigger spec: request:echo

Exposes /api/v3/engine/echo. POST a JSON body and the plugin echoes it
back with status 200 and Content-Type: application/json. GET requests
return a small status object.

Demonstrates:
- the process_request entry-point signature (5 params)
- parsing request_body
- two return shapes: bare dict (auto-JSON, status 200) and (body, status) tuple
"""
import json


def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):
    influxdb3_local.info(f"echo plugin called with body length {len(request_body or b'')}")

    if request_body:
        try:
            payload = json.loads(request_body)
        except json.JSONDecodeError:
            return ({"error": "invalid JSON body"}, 400)
        return ({"echo": payload, "len": len(request_body)}, 200)

    return {"status": "ok", "hint": "POST a JSON body to echo it back"}
