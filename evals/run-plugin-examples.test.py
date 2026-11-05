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


if __name__ == "__main__":
    unittest.main()
