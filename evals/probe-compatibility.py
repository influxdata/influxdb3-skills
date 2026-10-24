#!/usr/bin/env python3
"""Probe existing 3.12.1 compatibility contracts on isolated, disposable resources.

Uses only the Python standard library. Admin credentials stay in memory and are
read from local token files. Every created resource has a unique run prefix;
cleanup never lists or removes user resources. The transcript records actual
responses, including failures, rather than relabeling an expectation as evidence.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


PRODUCTS = {
    "core": ("http://127.0.0.1:8282", "influxdb3-core", ".influxdb3-core-admin-token.json"),
    "enterprise": ("http://127.0.0.1:8181", "influxdb3-enterprise", ".influxdb3-enterprise-admin-token.json"),
}


class Probe:
    def __init__(self, product, prefix, output):
        self.product = product
        self.url, self.container, token_file = PRODUCTS[product]
        self.token = json.loads((pathlib.Path.home() / token_file).read_text())["token"]
        self.secret_values = [self.token]
        self.prefix = prefix
        self.output = output
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.databases = []
        self.triggers = []
        self.plugin_files = []
        self.tokens = []
        self.data = {
            "product": f"influxdb3-{product}", "expected_version": "3.12.1",
            "node": "node0" if product == "enterprise" else "core",
            "container": self.container, "endpoint": self.url,
            "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "resource_prefix": prefix, "observations": [], "cleanup": [],
        }

    def sanitize(self, value):
        if isinstance(value, str):
            for secret in self.secret_values:
                value = value.replace(secret, "<redacted>")
            value = value.replace(str(pathlib.Path.home()), "/Users/USER")
            value = re.sub(r"(?i)apiv3_[A-Za-z0-9+/_=-]{12,}", "<redacted>", value)
            value = re.sub(r"(https?://)[^/\s:@]+:[^/\s@]+@", r"\1<redacted>@", value)
            return value
        if isinstance(value, list):
            return [self.sanitize(v) for v in value]
        if isinstance(value, dict):
            return {k: self.sanitize(v) for k, v in value.items()}
        return value

    def save(self):
        self.output.parent.mkdir(parents=True, exist_ok=True)
        self.output.write_text(json.dumps(self.sanitize(self.data), indent=2) + "\n")

    def request(self, label, method, path, body=None, content_type=None,
                expected_status=None, cleanup=False, auth_token=None, secret_response=False):
        payload = body
        if isinstance(body, dict):
            payload = json.dumps(body).encode()
            content_type = "application/json"
        elif isinstance(body, str):
            payload = body.encode()
        headers = {"Authorization": f"Bearer {auth_token or self.token}"}
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(self.url + path, data=payload, method=method, headers=headers)
        row = {"label": label, "at": dt.datetime.now(dt.timezone.utc).isoformat(),
               "method": method, "path": path, "request_body": body,
               "request_content_type": content_type, "expected_status": expected_status}
        try:
            try:
                response = self.opener.open(request, timeout=35)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                row["status"] = response.status
                row["response_headers"] = dict(response.headers.items())
                row["response_body"] = response.read().decode("utf-8", errors="replace")
                row["passed"] = expected_status is None or response.status == expected_status
        except (OSError, urllib.error.URLError) as error:
            row.update(status=None, error=str(error), passed=False)
        saved_row = self.sanitize(row)
        if secret_response:
            saved_row["response_body"] = "<redacted token creation response>"
        self.data["cleanup" if cleanup else "observations"].append(saved_row)
        self.save()
        return row

    def create_database(self, name, explicit=False):
        body = {"db": name}
        if explicit:
            body["schema_mode"] = "explicit"
        row = self.request("create-explicit-db" if explicit else "create-implicit-db", "POST",
                           "/api/v3/configure/database", body, expected_status=200)
        if row["status"] == 200:
            self.databases.append(name)
        return row

    def query(self, label, database, sql):
        return self.request(label, "POST", "/api/v3/query_sql",
                            {"db": database, "q": sql, "format": "json"}, expected_status=200)

    def check_count(self, label, database, probe_case, expected):
        sql = f"SELECT count(*) AS n FROM batch WHERE probe_case='{probe_case}'"
        actual = None
        for attempt in range(8):
            row = self.query(label if attempt == 0 else f"{label}-visibility-retry-{attempt}", database, sql)
            try:
                actual = json.loads(row["response_body"])[0]["n"]
            except (KeyError, IndexError, TypeError, ValueError):
                actual = None
            if actual == expected:
                break
            time.sleep(0.25)
        self.data["observations"].append({"label": label + "-assertion", "expected_rows": expected,
                                          "actual_rows": actual, "passed": actual == expected})
        self.save()

    def write_contracts(self, database):
        v3 = "/api/v3/write_lp?" + urllib.parse.urlencode({"db": database})
        self.request("seed-batch-table", "POST", v3, "batch,probe_case=setup value=1.0", expected_status=204)
        variants = [
            ("v3-default", v3, 1), ("v3-true", v3 + "&accept_partial=true", 1),
            ("v3-false", v3 + "&accept_partial=false", 0),
            ("v2-default", "/api/v2/write?bucket=" + database, 0),
            ("v2-true", "/api/v2/write?bucket=" + database + "&accept_partial=true", 0),
            ("v2-false", "/api/v2/write?bucket=" + database + "&accept_partial=false", 0),
            ("v1-default", "/write?db=" + database, 0),
            ("v1-true", "/write?db=" + database + "&accept_partial=true", 0),
            ("v1-false", "/write?db=" + database + "&accept_partial=false", 0),
        ]
        for label, path, expected in variants:
            case = label.replace("-", "_")
            timestamp = time.time_ns()
            batch = (f"batch,probe_case={case} value=1.0 {timestamp}\n"
                     f'batch,probe_case={case} value="wrong-type" {timestamp + 1}')
            self.request(label, "POST", path, batch, expected_status=400)
            # Read after the error, then again after a short interval: a 400 is
            # not evidence that the valid line was rolled back.
            self.check_count(label + "-rows", database, case, expected)
            time.sleep(0.2)
            self.check_count(label + "-rows-recheck", database, case, expected)
        # The documented maximum is 2262-04-11T23:39:59.999999999Z.
        maximum = 9223371599999999999
        self.request("timestamp-at-maximum", "POST", v3,
                     f"timestamp_probe value=1i {maximum}", expected_status=204)
        self.request("timestamp-after-maximum", "POST", v3,
                     f"timestamp_probe value=1i {maximum + 1}", expected_status=400)
        self.query("timestamp-readback", database, "SELECT * FROM timestamp_probe ORDER BY time")
        for delay in (0.5, 1.0):
            time.sleep(delay)
            self.query(f"timestamp-readback-after-{delay}s", database, "SELECT * FROM timestamp_probe ORDER BY time")

    def explicit_schema(self):
        database = self.prefix + "_explicit"
        if self.product == "core":
            row = self.request("core-explicit-mode-rejected", "POST", "/api/v3/configure/database",
                               {"db": database, "schema_mode": "explicit"}, expected_status=400)
            if row["status"] == 200:
                self.databases.append(database)
            return
        if self.create_database(database, explicit=True)["status"] != 200:
            return
        path = "/api/v3/write_lp?db=" + database
        self.request("explicit-undeclared-table", "POST", path, "sensor,device=d1 temp=1.0", expected_status=400)
        self.request("declare-table-for-existing-explicit-db", "POST", "/api/v3/configure/table",
                     {"db": database, "table": "sensor", "tags": ["device"],
                      "fields": [{"name": "temp", "type": "float64"}]}, expected_status=200)
        self.request("explicit-declared-column", "POST", path, "sensor,device=d1 temp=1.0", expected_status=204)
        self.request("explicit-undeclared-column", "POST", path, "sensor,device=d1 humidity=40.0", expected_status=400)

    def plugins(self, database):
        filename = self.prefix + ".py"
        trigger = self.prefix + "_request"
        route = self.prefix + "_route"
        source = ("def process_request(influxdb3_local, query_parameters, request_headers, request_body, args=None):\n"
                  f'    return {{"probe": "{self.prefix}"}}\n')
        uploaded = self.request("plugin-post-json", "POST", "/api/v3/plugins/files",
                                {"plugin_name": filename, "content": source}, expected_status=200)
        if uploaded["status"] != 200:
            return
        self.plugin_files.append(filename)
        self.request("plugin-octet-put-rejected", "PUT", "/api/v3/plugins/files?path=" + filename,
                     source, "application/octet-stream", expected_status=415)
        created = self.request("trigger-omitted-settings-and-disabled", "POST", "/api/v3/configure/processing_engine_trigger",
                               {"db": database, "plugin_filename": filename, "trigger_name": trigger,
                                "trigger_specification": "request:" + route}, expected_status=200)
        if created["status"] != 200:
            return
        self.triggers.append((database, trigger))
        defaults = self.query("trigger-defaults-row", database,
                              f"SELECT * FROM system.processing_engine_triggers WHERE trigger_name='{trigger}'")
        try:
            settings = json.loads(defaults["response_body"])[0]
        except (KeyError, IndexError, TypeError, ValueError):
            settings = {}
        self.data["observations"].append({
            "label": "trigger-observable-defaults-assertion",
            "disabled": settings.get("disabled"), "error_behavior": settings.get("error_behavior"),
            "run_async": "not exposed in this system-table projection; concurrency not behavior-tested",
            "passed": settings.get("disabled") is False and settings.get("error_behavior") == "log",
        })
        invoked = self.request("invoke-minimal-request-trigger", "GET", "/api/v3/engine/" + route, expected_status=200)
        try:
            result = json.loads(invoked["response_body"])
        except (KeyError, TypeError, ValueError):
            result = None
        self.data["observations"].append({"label": "request-trigger-output-assertion",
                                          "actual": result, "passed": result == {"probe": self.prefix}})
        self.save()

    def package_failure(self):
        # Arguments reach pip verbatim. No index and an impossible UUID name
        # make this a local failed resolution without changing dependencies.
        self.request("failed-package-install-no-index", "POST", "/api/v3/configure/plugin_environment/install_packages",
                     {"packages": ["--no-index", "zz_" + self.prefix + "_nonexistent"]},
                     expected_status=500 if self.product == "enterprise" else 200)

    def scoped_diagnose(self, database):
        if self.product != "enterprise":
            return
        name = self.prefix + "_reader"
        created = self.request("create-scoped-reader", "POST", "/api/v3/enterprise/configure/token",
                               {"type": "resource", "token_name": name, "expiry_secs": 600,
                                "permissions": [{"resource_type": "db", "resource_names": [database], "actions": ["read"]}]},
                               expected_status=201, secret_response=True)
        if created["status"] != 201:
            return
        self.tokens.append(name)
        scoped = json.loads(created["response_body"])["token"]
        self.secret_values.append(scoped)
        self.request("scoped-reader-ping-denied", "GET", "/ping", expected_status=403, auth_token=scoped)
        script = pathlib.Path(__file__).resolve().parent.parent / "skills/influxdb3/examples/diagnose/diagnose.py"
        environment = dict(os.environ, INFLUXDB_HOST=self.url, INFLUXDB_TOKEN=scoped,
                           INFLUXDB_DATABASE=database, PYTHON_DOTENV_DISABLED="1")
        command = ["uv", "run", "--quiet", "--with", "requests", "--with", "python-dotenv", "python", str(script)]
        result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=90, check=False)
        self.data["observations"].append(self.sanitize({
            "label": "diagnose-scoped-reader", "exit_code": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
            "passed": result.returncode == 0 and "Read-side health: OK" in result.stdout,
        }))
        self.save()

    def cleanup(self):
        for name in reversed(self.tokens):
            self.request("delete-created-scoped-token", "DELETE", "/api/v3/configure/token?" +
                         urllib.parse.urlencode({"token_name": name}), expected_status=200, cleanup=True)
        for database, trigger in reversed(self.triggers):
            path = "/api/v3/configure/processing_engine_trigger?" + urllib.parse.urlencode(
                {"db": database, "trigger_name": trigger, "force": "true"})
            self.request("delete-created-trigger", "DELETE", path, expected_status=200, cleanup=True)
        for database in reversed(self.databases):
            path = "/api/v3/configure/database?" + urllib.parse.urlencode({"db": database, "hard_delete_at": "now"})
            self.request("delete-created-database", "DELETE", path, expected_status=200, cleanup=True)
        for filename in self.plugin_files:
            # Only a filename generated and uploaded by this exact run can be removed.
            if not re.fullmatch(r"skills_3121_[a-f0-9]{12}\.py", filename):
                raise RuntimeError("refusing cleanup of a file outside this run")
            command = ["docker", "exec", self.container, "rm", "--", "/plugins/" + filename]
            result = subprocess.run(command, capture_output=True, text=True, timeout=15, check=False)
            self.data["cleanup"].append({"label": "delete-created-plugin-file", "command": command,
                                         "exit_code": result.returncode, "stdout": result.stdout,
                                         "stderr": result.stderr, "passed": result.returncode == 0})
        self.data["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        self.save()

    def run(self, skip_packages=False):
        try:
            ping = self.request("version", "GET", "/ping", expected_status=200)
            headers = {k.lower(): v for k, v in ping.get("response_headers", {}).items()}
            self.data["observed_version"] = headers.get("x-influxdb-version")
            if self.data["observed_version"] != "3.12.1":
                raise RuntimeError("server does not report exact version 3.12.1")
            database = self.prefix + "_implicit"
            if self.create_database(database)["status"] != 200:
                raise RuntimeError("could not create isolated database")
            self.write_contracts(database)
            self.explicit_schema()
            self.plugins(database)
            self.scoped_diagnose(database)
            if not skip_packages:
                self.package_failure()
        except Exception as error:
            self.data["observations"].append({"label": "probe-error", "error": self.sanitize(str(error)), "passed": False})
        finally:
            self.cleanup()
        failures = sum(row.get("passed") is False for row in self.data["observations"] + self.data["cleanup"])
        print(f"{self.product}: {failures} failed expectations; transcript: {self.output}")
        return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", nargs="+", choices=PRODUCTS, default=list(PRODUCTS))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("evals/results/compatibility-live"))
    parser.add_argument("--skip-packages", action="store_true")
    args = parser.parse_args()
    prefix = "skills_3121_" + uuid.uuid4().hex[:12]
    failures = sum(Probe(product, prefix, args.out / f"{prefix}-{product}.json").run(args.skip_packages)
                   for product in args.products)
    return int(failures > 0)


if __name__ == "__main__":
    sys.exit(main())
