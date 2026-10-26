#!/usr/bin/env python3
"""Run shipped Processing Engine examples on isolated 3.12.1 test resources.

Python standard library only. Tokens are read into memory from local admin-token
JSON files and never recorded. Requires Docker access to stage byte-identical
fixtures in one uniquely named plugin folder, then remove only that folder.
The JSON transcript records actual responses, assertions, and cleanup outcomes.
"""

import argparse
import base64
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "skills/influxdb3-plugins/examples"
PRODUCTS = {
    "core": ("http://127.0.0.1:8282", "influxdb3-core"),
    "enterprise": ("http://127.0.0.1:8181", "influxdb3-enterprise"),
}
CASES = ("wal", "scheduled", "request", "cache_counter", "multifile_alert", "toml_config")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


class Runner:
    def __init__(self, product, output, cadence, timeout, examples):
        self.product = product
        self.url, self.container = PRODUCTS[product]
        token_file = pathlib.Path.home() / f".influxdb3-{product}-admin-token.json"
        self.token = json.loads(token_file.read_text())["token"]
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.prefix = "skills_plugin_" + uuid.uuid4().hex[:12]
        self.output = output / f"{self.prefix}-{product}.json"
        self.cadence, self.timeout = cadence, timeout
        self.cases = examples
        self.toml_config_bytes = None
        self.databases, self.triggers = [], []
        self.staged = False
        self.data = {
            "product": f"influxdb3-{product}", "endpoint": self.url,
            "expected_version": "3.12.1", "container": self.container,
            "started_at": now(), "resource_prefix": self.prefix,
            "fixture_sha256": {}, "events": [], "assertions": [], "cleanup": [],
            "selected_examples": list(self.cases),
            "adaptations": [
                "Fixture source is unchanged; stage only .py and .toml files in a unique plugin folder.",
                f"Scheduled triggers use every:{cadence}s for bounded verification; cadence is trigger configuration, not a source edit.",
                "Request trigger uses a unique route instead of the README's shared echo route.",
                "Multifile fixtures are staged with docker cp; this does not test CLI directory upload.",
                "Enterprise is reached through node0 on the running cluster; this is not a distributed-execution or replay certification.",
            ],
        }

    def clean(self, value):
        if isinstance(value, str):
            value = value.replace(self.token, "<redacted>")
            value = value.replace(str(pathlib.Path.home()), "/Users/USER")
            return re.sub(r"(?i)apiv3_[A-Za-z0-9+/_=-]{12,}", "<redacted>", value)
        if isinstance(value, dict):
            return {k: self.clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.clean(v) for v in value]
        return value

    def save(self):
        self.output.parent.mkdir(parents=True, exist_ok=True)
        self.output.write_text(json.dumps(self.clean(self.data), indent=2) + "\n")

    def check(self, label, passed, observed):
        self.data["assertions"].append({"label": label, "passed": bool(passed), "observed": observed, "at": now()})
        self.save()
        if not passed:
            raise AssertionError(label)

    def http(self, method, path, body=None, cleanup=False):
        headers = {"Authorization": "Bearer " + self.token}
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        elif isinstance(body, str):
            body = body.encode()
            headers["Content-Type"] = "text/plain"
        request = urllib.request.Request(self.url + path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = response.read().decode("utf-8", errors="replace")
            event = {"at": now(), "method": method, "path": path, "status": response.status,
                     "headers": dict(response.headers.items()), "body": payload}
        self.data["cleanup" if cleanup else "events"].append(event)
        self.save()
        return event

    def query(self, database, sql):
        row = self.http("POST", "/api/v3/query_sql", {"db": database, "q": sql, "format": "json"})
        if row["status"] != 200:
            return None
        return json.loads(row["body"])

    def poll(self, label, read, predicate):
        deadline, actual = time.monotonic() + self.timeout, None
        while time.monotonic() < deadline:
            actual = read()
            if predicate(actual):
                self.check(label, True, actual)
                return actual
            time.sleep(0.75)
        self.check(label, False, actual)

    def logs(self, database, trigger):
        return self.query(database, "SELECT event_time, log_level, log_text FROM system.processing_engine_logs "
                          f"WHERE trigger_name='{trigger}' ORDER BY event_time DESC LIMIT 60")

    def log_contains(self, database, trigger, text):
        return self.poll("log: " + text, lambda: self.logs(database, trigger),
                         lambda rows: rows is not None and any(text in r["log_text"] for r in rows))

    def database(self, case):
        name = self.prefix + "_" + case
        result = self.http("POST", "/api/v3/configure/database", {"db": name})
        self.check(case + ": database created", result["status"] == 200, result)
        self.databases.append(name)
        return name

    def write(self, database, temperature):
        path = "/api/v3/write_lp?" + urllib.parse.urlencode({"db": database})
        result = self.http("POST", path, f"sensors_demo,host=server01 temp={temperature} {time.time_ns()}")
        self.check("sensor write accepted", result["status"] == 204, result)

    def trigger(self, database, case, filename, spec, arguments=None):
        name = self.prefix + "_" + case
        body = {"db": database, "trigger_name": name, "plugin_filename": self.prefix + "/" + filename,
                "trigger_specification": spec, "trigger_settings": {"run_async": False, "error_behavior": "log"},
                "disabled": False}
        if arguments:
            body["trigger_arguments"] = arguments
        result = self.http("POST", "/api/v3/configure/processing_engine_trigger", body)
        self.check(case + ": trigger created", result["status"] == 200, result)
        self.triggers.append((database, name))
        self.data.setdefault("trigger_configurations", []).append(body)
        self.save()
        return name

    def stage(self):
        with tempfile.TemporaryDirectory(prefix="skills-plugin-fixture-") as temporary:
            fixture = pathlib.Path(temporary) / self.prefix
            for case in self.cases:
                for source in sorted((EXAMPLES / case).iterdir()):
                    if source.suffix not in (".py", ".toml"):
                        continue
                    destination = fixture / case / source.name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if case == "toml_config" and source.suffix == ".toml":
                        self.toml_config_bytes = source.read_bytes()
                        self.data["fixture_sha256"][source.relative_to(ROOT).as_posix()] = hashlib.sha256(self.toml_config_bytes).hexdigest()
                        continue
                    shutil.copyfile(source, destination)
                    self.data["fixture_sha256"][source.relative_to(ROOT).as_posix()] = hashlib.sha256(destination.read_bytes()).hexdigest()
            if "toml_config" in self.cases:
                observer = ('def process_scheduled_call(influxdb3_local, call_time, args=None):\n'
                            '    value = (args or {}).get("config_file_path")\n'
                            '    influxdb3_local.info("config_file_path_type=" + type(value).__name__ + ";argument_keys=" + ",".join(sorted((args or {}).keys())))\n')
                (fixture / "args_observer.py").write_text(observer)
                self.data["diagnostic_source_sha256"] = hashlib.sha256(observer.encode()).hexdigest()
            # No target directory can be reused from another invocation.
            exists = subprocess.run(["docker", "exec", self.container, "test", "-e", "/plugins/" + self.prefix], capture_output=True)
            self.check("staging namespace absent", exists.returncode == 1, {"exit_code": exists.returncode})
            staged = subprocess.run(["docker", "cp", str(fixture), self.container + ":/plugins/" + self.prefix], capture_output=True, text=True)
            self.staged = staged.returncode == 0
            self.check("byte-identical fixtures staged", self.staged, {"exit_code": staged.returncode, "stderr": staged.stderr})

    def wal(self):
        db = self.database("wal")
        trigger = self.trigger(db, "wal", "wal/process_writes_hello.py", "table:sensors_demo")
        self.write(db, 72.4)
        self.poll("WAL derived row", lambda: self.query(db, "SELECT source_table, row_count FROM processed_summary"),
                  lambda rows: rows is not None and any(r["source_table"] == "sensors_demo" and r["row_count"] == 1 for r in rows))
        self.log_contains(db, trigger, "WAL hello: 1 rows from sensors_demo")

    def scheduled(self):
        db = self.database("scheduled")
        self.write(db, 72.4)
        trigger = self.trigger(db, "scheduled", "scheduled/process_scheduled_call_hello.py", f"every:{self.cadence}s")
        self.poll("scheduled heartbeat persisted", lambda: self.query(db, "SELECT source, recent_count FROM scheduled_heartbeat"),
                  lambda rows: rows is not None and any(r["source"] == "scheduled_hello" and r["recent_count"] == 1 for r in rows))
        self.log_contains(db, trigger, "sensor rows in last minute")

    def request(self):
        db = self.database("request")
        route = self.prefix + "_echo"
        trigger = self.trigger(db, "request", "request/process_request_hello.py", "request:" + route)
        path = "/api/v3/engine/" + route
        self.poll("request GET status object", lambda: self.http("GET", path),
                  lambda r: r["status"] == 200 and json.loads(r["body"]).get("status") == "ok")
        payload = {"hello": "world", "n": 42}
        result = self.http("POST", path, payload)
        self.check("request POST echo", result["status"] == 200 and json.loads(result["body"]).get("echo") == payload, result)
        invalid = self.http("POST", path, "not-json")
        self.check("request invalid JSON", invalid["status"] == 400 and json.loads(invalid["body"]).get("error") == "invalid JSON body", invalid)
        self.log_contains(db, trigger, "echo plugin called with body length")

    def cache_counter(self):
        db = self.database("cache_counter")
        trigger = self.trigger(db, "cache_counter", "cache_counter/counter.py", f"every:{self.cadence}s")
        self.poll("cache counter persisted across invocations", lambda: self.query(db, 'SELECT "count" AS value FROM plugin_counter'),
                  lambda rows: rows is not None and {1, 2}.issubset({r["value"] for r in rows}))
        self.log_contains(db, trigger, "counter=2")
        self.log_contains(db, trigger, "temp_delete=ok")

    def multifile_alert(self):
        db = self.database("multifile_alert")
        trigger = self.trigger(db, "multifile_alert", "multifile_alert", "table:sensors_demo",
                               {"table": "sensors_demo", "field": "temp", "threshold": "75.0"})
        self.write(db, 70.0)
        self.log_contains(db, trigger, "alert config:")
        self.write(db, 82.5)
        self.poll("only above-threshold readings emit alerts", lambda: self.query(db, 'SELECT host, field, value, threshold FROM alert'),
                  lambda rows: bool(rows) and all(r["host"] == "server01" and r["field"] == "temp" and
                                                r["value"] == 82.5 and r["threshold"] == 75.0 for r in rows))
        self.log_contains(db, trigger, "emitted 1 alert(s) from sensors_demo")

    def toml_config(self):
        db = self.database("toml_config")
        observer = self.trigger(db, "args_observer", "args_observer.py", f"every:{self.cadence}s",
                                {"config_file_path": self.prefix + "_not_present.toml"})
        self.log_contains(db, observer, "config_file_path_type=str;argument_keys=config_file_path")
        encoded = base64.urlsafe_b64encode(self.toml_config_bytes).decode().rstrip("=")
        self.data["adaptations"].append("Optional TOML configuration is encoded at deployment into config_toml_b64; the unchanged plugin explicitly decodes and parses it. No TOML file is staged server-side.")
        trigger = self.trigger(db, "toml_config", "toml_config/example_toml_config.py", f"every:{self.cadence}s",
                               {"config_toml_b64": encoded})
        self.log_contains(db, trigger, "[demo-trigger] threshold=75 (int); warn_above=70, alert_above=90")

    def cleanup_cases(self):
        for database, trigger in reversed(self.triggers):
            path = "/api/v3/configure/processing_engine_trigger?" + urllib.parse.urlencode({"db": database, "trigger_name": trigger, "force": "true"})
            if self.delete_resource(path):
                self.triggers.remove((database, trigger))
        for database in reversed(self.databases):
            path = "/api/v3/configure/database?" + urllib.parse.urlencode({"db": database, "hard_delete_at": "now"})
            if self.delete_resource(path):
                self.databases.remove(database)
        self.save()

    def delete_resource(self, path):
        try:
            result = self.http("DELETE", path, cleanup=True)
            result["passed"] = result["status"] == 200
        except Exception as error:
            result = {"path": path, "passed": False, "error": str(error), "at": now()}
            self.data["cleanup"].append(result)
        return result["passed"]

    def cleanup(self):
        self.cleanup_cases()
        if self.staged:
            if not re.fullmatch(r"skills_plugin_[a-f0-9]{12}", self.prefix):
                raise RuntimeError("refusing cleanup outside this run's staging folder")
            try:
                removed = subprocess.run(["docker", "exec", self.container, "rm", "-rf", "--", "/plugins/" + self.prefix], capture_output=True, text=True, timeout=20)
                absent = subprocess.run(["docker", "exec", self.container, "test", "!", "-e", "/plugins/" + self.prefix], capture_output=True, text=True, timeout=20)
                self.data["cleanup"].append({"label": "remove-only-created-plugin-folder", "exit_code": removed.returncode,
                                             "absence_check_exit_code": absent.returncode, "stderr": removed.stderr,
                                             "passed": removed.returncode == 0 and absent.returncode == 0})
            except Exception as error:
                self.data["cleanup"].append({"label": "remove-only-created-plugin-folder", "passed": False, "error": str(error)})
        self.data["finished_at"] = now()
        self.data["passed"] = not any(row.get("passed") is False for row in self.data["assertions"] + self.data["cleanup"])
        self.save()

    def run(self):
        try:
            ping = self.http("GET", "/ping")
            headers = {k.lower(): v for k, v in ping["headers"].items()}
            self.data["observed_version"] = headers.get("x-influxdb-version")
            self.check("exact server version", ping["status"] == 200 and self.data["observed_version"] == "3.12.1", ping)
            image = subprocess.run(["docker", "inspect", "--format", "{{.Image}}", self.container], capture_output=True, text=True)
            self.data["image_id"] = image.stdout.strip()
            self.stage()
            for case in self.cases:
                try:
                    getattr(self, case)()
                    print(f"{self.product}: {case}: PASS", flush=True)
                except Exception as error:
                    self.data["assertions"].append({"label": case + ": runtime error", "passed": False, "error": str(error), "at": now()})
                    self.save()
                    print(f"{self.product}: {case}: FAIL", flush=True)
                finally:
                    # Core has a small database limit. Release this case's
                    # resources before allocating the next isolated database.
                    self.cleanup_cases()
        except Exception as error:
            self.data["assertions"].append({"label": "preflight failure", "passed": False, "error": str(error)})
        finally:
            self.cleanup()
        failed = [r for r in self.data["assertions"] + self.data["cleanup"] if r.get("passed") is False]
        self.data["passed"] = not failed
        self.save()
        location = self.output.relative_to(ROOT) if self.output.is_relative_to(ROOT) else self.output.name
        print(f"{self.product}: {len(failed)} failed assertions/cleanup; transcript: {location}", flush=True)
        return bool(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", nargs="+", choices=PRODUCTS, default=list(PRODUCTS))
    parser.add_argument("--out", type=pathlib.Path, default=ROOT / "evals/results/plugin-roundtrips")
    parser.add_argument("--cadence", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--include-toml", action="store_true", help="also run the optional TOML configuration example")
    parser.add_argument("--examples", nargs="+", choices=CASES, default=list(CASES[:-1]))
    args = parser.parse_args()
    if args.cadence < 1 or args.timeout < 2 * args.cadence:
        parser.error("timeout must cover at least two positive scheduled cadences")
    examples = list(dict.fromkeys(args.examples + (["toml_config"] if args.include_toml else [])))
    return int(any([Runner(product, args.out.resolve(), args.cadence, args.timeout, examples).run() for product in args.products]))


if __name__ == "__main__":
    sys.exit(main())
