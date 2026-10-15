"""Offline regression tests; all generated fixtures live in the system temporary directory."""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


SKILL = Path(__file__).resolve().parents[1]
SCRIPT = SKILL / "scripts/inventory.py"
WORK = Path(tempfile.gettempdir()).resolve()
SPEC = importlib.util.spec_from_file_location("research_inventory", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.dont_write_bytecode = True
SPEC.loader.exec_module(MODULE)


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp(prefix="inventory-check-", dir=WORK))
        self.root = self.base / "科研 项目"
        self.root.mkdir()
        self.content = {
            "批次一/results.csv": b"x,y\n1,2\n",
            "批次二/results.csv": b"x,y\n3,4\n",
            ".hidden.txt": b"hidden",
            "notes.MD": "中文笔记".encode("utf-8"),
        }
        for relative, data in self.content.items():
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        for name in MODULE.EXCLUDED:
            path = self.root / name
            path.mkdir()
            (path / "ignored.bin").write_bytes(b"do not enter")

    def tearDown(self):
        target = self.base.resolve()
        self.assertEqual(target.parent, WORK.resolve())
        self.assertTrue(target.name.startswith("inventory-check-"))
        shutil.rmtree(target)

    def snapshot(self):
        return {
            str(path.relative_to(self.root)): (
                hashlib.sha256(path.read_bytes()).hexdigest(),
                path.stat().st_mtime_ns,
            )
            for path in self.root.rglob("*") if path.is_file()
        }

    def test_metadata_only_and_no_changes(self):
        before = self.snapshot()
        with mock.patch("builtins.open", side_effect=AssertionError("File content read")):
            report, code = MODULE.inventory(self.root)
        self.assertEqual(code, 0)
        self.assertTrue(report["complete"])
        self.assertEqual(self.snapshot(), before)
        files = {entry["path"]: entry for entry in report["entries"] if entry["kind"] == "file"}
        self.assertEqual(set(files), set(self.content))
        self.assertEqual(report["summary"]["total_file_bytes"], sum(map(len, self.content.values())))
        self.assertEqual(report["summary"]["files"], 4)
        self.assertEqual(report["summary"]["directories"], 2)
        self.assertEqual(files["notes.MD"]["extension"], ".md")
        for relative, data in self.content.items():
            self.assertEqual(files[relative]["size_bytes"], len(data))
            self.assertTrue(files[relative]["mtime_utc"].endswith("Z"))
        self.assertEqual({item["path"] for item in report["skipped"]}, MODULE.EXCLUDED)
        self.assertEqual(report["summary"]["skipped_directories"], 7)

    def test_utf8_stdout_cli(self):
        process = subprocess.run([sys.executable, str(SCRIPT), str(self.root)], capture_output=True)
        self.assertEqual(process.returncode, 0, process.stderr.decode("utf-8"))
        text = process.stdout.decode("utf-8")
        self.assertIn("批次一", text)
        self.assertNotIn("\\u6279", text)
        self.assertEqual(json.loads(text)["summary"]["files"], 4)

    def test_invalid_roots(self):
        for path in (self.base / "missing", self.root / "notes.MD"):
            with self.subTest(root=path):
                report, code = MODULE.inventory(path)
                self.assertEqual(code, 2)
                self.assertFalse(report["complete"])
                self.assertEqual(report["errors"][0]["operation"], "validate_root")
        process = subprocess.run([sys.executable, str(SCRIPT), str(self.base / "missing")], capture_output=True)
        self.assertEqual(process.returncode, 2)
        self.assertEqual(json.loads(process.stdout)["summary"]["errors"], 1)

    def test_scan_errors_are_reported_and_exit_nonzero(self):
        original_scandir = os.scandir
        blocked = self.root / "批次二"

        def deny_subdirectory(path):
            if Path(path) == blocked:
                raise PermissionError("simulated inaccessible directory")
            return original_scandir(path)

        capture = io.StringIO()
        with mock.patch.object(MODULE.os, "scandir", side_effect=deny_subdirectory), contextlib.redirect_stdout(capture):
            code = MODULE.main([str(self.root)])
        report = json.loads(capture.getvalue())
        self.assertEqual(code, 1)
        self.assertFalse(report["complete"])
        self.assertEqual(report["errors"][0]["path"], "批次二")
        self.assertIn("PermissionError", report["errors"][0]["error"])
        self.assertEqual(report["summary"]["files"], 3)
        with mock.patch.object(MODULE.os, "scandir", side_effect=PermissionError("root access denied")):
            report, code = MODULE.inventory(self.root)
        self.assertEqual(code, 2)
        self.assertEqual(report["errors"][0]["path"], ".")

    def test_symlink_is_not_followed_and_cannot_be_root(self):
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_text("outside root", encoding="utf-8")
        link = self.root / "shared-link"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"Symlink creation unavailable: {exc}")
        report, code = MODULE.inventory(self.root)
        self.assertEqual(code, 0)
        entries = {item["path"]: item for item in report["entries"]}
        self.assertEqual(entries["shared-link"]["kind"], "link")
        self.assertFalse(any(path.startswith("shared-link/") for path in entries))
        self.assertEqual(MODULE.inventory(link)[1], 2)

    @unittest.skipUnless(os.name == "nt", "Windows junction test")
    def test_junction_is_not_followed_and_cannot_be_root(self):
        import _winapi
        outside = self.base / "shared"
        outside.mkdir()
        (outside / "sentinel.txt").write_text("outside root", encoding="utf-8")
        junction = self.root / "shared-junction"
        _winapi.CreateJunction(str(outside), str(junction))
        report, code = MODULE.inventory(self.root)
        self.assertEqual(code, 0)
        entries = {item["path"]: item for item in report["entries"]}
        self.assertEqual(entries["shared-junction"]["kind"], "link")
        self.assertFalse(any(path.startswith("shared-junction/") for path in entries))
        self.assertEqual(MODULE.inventory(junction)[1], 2)

    @unittest.skipUnless(os.name == "nt", "Windows hidden-attribute test")
    def test_windows_hidden_file_is_visible(self):
        import ctypes
        hidden = self.root / "hidden-attribute.txt"
        hidden.write_text("hidden by attribute", encoding="utf-8")
        self.assertNotEqual(ctypes.windll.kernel32.SetFileAttributesW(str(hidden), 0x2), 0)
        report, code = MODULE.inventory(self.root)
        self.assertEqual(code, 0)
        self.assertIn("hidden-attribute.txt", {item["path"] for item in report["entries"]})


if __name__ == "__main__":
    unittest.main(verbosity=2)
