"""Isolated negative checks for the plugin-runner cleanup boundary."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("plugin_runner", ROOT / "evals/run-plugin-examples.py")
runner_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner_module)


class CleanupTests(unittest.TestCase):
    def test_transport_error_does_not_prevent_other_resources_or_final_transcript(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / ".influxdb3-core-admin-token.json").write_text('{"token":"fixture-only"}')
            with patch.object(Path, "home", return_value=directory):
                runner = runner_module.Runner("core", directory, 5, 30, ["wal"])
            runner.databases = [runner.prefix + "_one", runner.prefix + "_two"]
            runner.triggers = [(db, db + "_trigger") for db in runner.databases]
            runner.staged = True
            calls = []

            def http(method, path, cleanup=False):
                calls.append((method, path))
                if "trigger_name=" + runner.prefix + "_two_trigger" in path:
                    raise urllib.error.URLError("connection reset")
                row = {"status": 200, "path": path}
                runner.data["cleanup"].append(row)
                return row

            with patch.object(runner, "http", side_effect=http), patch.object(
                    subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")) as docker:
                runner.cleanup()

            self.assertEqual(len(calls), 4)
            self.assertEqual(docker.call_count, 2)
            saved = json.loads(runner.output.read_text())
            self.assertTrue(saved["finished_at"])
            self.assertFalse(saved["passed"])
            self.assertEqual(sum(row.get("passed") is False for row in saved["cleanup"]), 1)
            self.assertEqual(sum(row.get("passed") is True for row in saved["cleanup"]), 4)

    def test_docker_timeout_is_recorded_and_transcript_is_finalized(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / ".influxdb3-core-admin-token.json").write_text('{"token":"fixture-only"}')
            with patch.object(Path, "home", return_value=directory):
                runner = runner_module.Runner("core", directory, 5, 30, ["wal"])
            runner.staged = True
            with patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired("docker", 20)):
                runner.cleanup()
            saved = json.loads(runner.output.read_text())
            self.assertTrue(saved["finished_at"])
            self.assertFalse(saved["passed"])
            self.assertFalse(saved["cleanup"][0]["passed"])


class OfflineTestCaseTests(unittest.TestCase):
    def runner(self, directory, cases):
        (directory / ".influxdb3-core-admin-token.json").write_text('{"token":"fixture-only-token"}')
        with patch.object(Path, "home", return_value=directory):
            return runner_module.Runner("core", directory, 5, 30, cases)

    def test_offline_test_is_staged_through_the_api_not_docker_cp(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = self.runner(Path(temporary), ["offline_test"])
            copied = []

            def run(command, **kwargs):
                if command[:2] == ["docker", "cp"]:
                    copied.extend(path.name for path in Path(command[2]).rglob("*"))
                return subprocess.CompletedProcess(command, 1 if "test" in command else 0, "", "")

            with patch.object(subprocess, "run", side_effect=run):
                runner.stage()
            self.assertEqual(copied, [])
            self.assertTrue(runner.staged)

    def test_cli_test_passes_the_token_only_through_the_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = self.runner(Path(temporary), ["offline_test"])
            stdout = '{"log_lines": [], "database_writes": {}, "errors": []}'
            with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout, "")) as run:
                runner.cli_test("wal_plugin", "db", "offline_test/plugin.py", "--lp", "m f=1")
            command, kwargs = run.call_args.args[0], run.call_args.kwargs
            self.assertNotIn("fixture-only-token", " ".join(command))
            self.assertEqual(kwargs["env"]["INFLUXDB3_AUTH_TOKEN"], "fixture-only-token")
            self.assertEqual(command[-1], runner.prefix + "/offline_test/plugin.py")
            self.assertNotIn("fixture-only-token", runner.output.read_text())

    def test_cli_test_fails_when_the_plugin_reports_errors(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = self.runner(Path(temporary), ["offline_test"])
            stdout = '{"log_lines": [], "database_writes": {}, "errors": ["boom"]}'
            with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout, "")), \
                    self.assertRaises(AssertionError):
                runner.cli_test("wal_plugin", "db", "offline_test/plugin.py")


if __name__ == "__main__":
    unittest.main()
