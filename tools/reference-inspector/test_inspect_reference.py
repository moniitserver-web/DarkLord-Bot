"""Small synthetic fixtures; never executes a submitted program."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("inspect_reference.py")


def version_block(key, text=None, children=()):
    raw = bytearray(b"\0" * 6 + key.encode("utf-16le") + b"\0\0")
    raw.extend(b"\0" * (-len(raw) % 4))
    value = (text + "\0").encode("utf-16le") if text else b""
    raw.extend(value)
    for child in children:
        raw.extend(b"\0" * (-len(raw) % 4))
        raw.extend(child)
    struct.pack_into("<HHH", raw, 0, len(raw), len(value) // 2, 1)
    return bytes(raw)


def synthetic_pe():
    version = version_block("VS_VERSION_INFO", children=[version_block(
        "StringFileInfo", children=[version_block("040904b0", children=[
            version_block("ProductName", "Fixture App"),
            version_block("ProductVersion", "1.2.3.4"),
        ])])])
    data = bytearray(0xA00)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HHIIIHH", data, 0x84, 0x8664, 3, 0, 0, 0, 240, 0x22)
    struct.pack_into("<H", data, 0x98, 0x20B)
    struct.pack_into("<I", data, 0x98 + 108, 16)
    struct.pack_into("<II", data, 0x98 + 112 + 16, 0x2000, 0x400)
    for i, (name, rva, raw, size) in enumerate([
        (b".text", 0x1000, 0x400, 0x200),
        (b".rsrc", 0x2000, 0x600, 0x400),
        (b".themida", 0x3000, 0xA00, 0),
    ]):
        p = 0x188 + i * 40
        data[p:p + 8] = name.ljust(8, b"\0")
        struct.pack_into("<IIII", data, p + 8, size, rva, size, raw)
    marker = "力量加持 5500101".encode("utf-8")
    data[0x400:0x400 + len(marker)] = marker
    for offset, key, dest in [(0, 16, 24), (24, 1, 48), (48, 1033, 72)]:
        struct.pack_into("<HH", data, 0x600 + offset + 12, 0, 1)
        struct.pack_into("<II", data, 0x600 + offset + 16, key,
                         dest | (0x80000000 if offset < 48 else 0))
    struct.pack_into("<IIII", data, 0x648, 0x2100, len(version), 0, 0)
    data[0x700:0x700 + len(version)] = version
    return bytes(data)


class InspectorTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), "Static inspector has not been implemented")
        spec = importlib.util.spec_from_file_location("reference_inspector", SCRIPT)
        self.inspector = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.inspector)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_pe_reports_version_and_indicators_without_dumping_data(self):
        data = synthetic_pe()
        path = self.root / "fixture.exe"
        path.write_bytes(data)
        report = self.inspector.inspect_file(path)
        self.assertEqual(report["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(report["format"], "PE")
        self.assertEqual(report["pe"]["architecture"], "x64")
        self.assertEqual(report["pe"]["version"]["ProductVersion"], "1.2.3.4")
        self.assertEqual(report["pe"]["version"]["ProductName"], "Fixture App")
        self.assertIn("Themida section marker", report["pe"]["protection_indicators"])
        self.assertEqual(report["pe"]["resources"][0]["type"], "VERSION")
        self.assertEqual(report["dictionary_terms"]["力量加持"]["utf8"], 1)

    def test_zip_only_reads_known_dictionary_candidates_and_never_extracts(self):
        path = self.root / "fixture.zip"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("data/ModEffectTable.json", '{"EffectName":"力量加持"}')
            archive.writestr("../ItemTable.json", '力量加持')
            archive.writestr("secrets/ItemTable.json", 'private-secret-marker')
            archive.writestr("game.exe", b"do not execute")
        report = self.inspector.inspect_file(path)
        entries = {entry["path"]: entry for entry in report["zip"]["entries"]}
        self.assertEqual(entries["data/ModEffectTable.json"]["dictionary_terms"]["力量加持"]["utf8"], 1)
        self.assertEqual(entries["../ItemTable.json"]["content_scan"], "skipped unsafe path")
        self.assertEqual(entries["secrets/ItemTable.json"]["content_scan"], "skipped sensitive path")
        self.assertEqual(entries["game.exe"]["content_scan"], "metadata only")
        self.assertNotIn("private-secret-marker", json.dumps(report))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["fixture.zip"])

    def test_zip_bounded_content_read_skips_high_compression_ratio(self):
        path = self.root / "compressed.zip"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("ItemTable.json", b"x" * 300_000)
        report = self.inspector.inspect_file(path)
        self.assertEqual(report["zip"]["entries"][0]["content_scan"], "skipped size or compression limit")

    def test_malformed_pe_is_reported_as_error_without_crashing_batch(self):
        path = self.root / "broken.exe"
        path.write_bytes(b"MZ")
        report = self.inspector.inspect_file(path)
        self.assertEqual(report["status"], "error")
        self.assertIn("Invalid PE", report["error"])

    def test_symlink_input_is_rejected(self):
        target = self.root / "target.exe"
        target.write_bytes(synthetic_pe())
        link = self.root / "link.exe"
        link.symlink_to(target)
        report = self.inspector.inspect_file(link)
        self.assertEqual(report["status"], "skipped")
        self.assertNotIn("sha256", report)

    def test_cli_writes_machine_readable_report(self):
        source = self.root / "input"
        source.mkdir()
        (source / "fixture.exe").write_bytes(synthetic_pe())
        output = self.root / "report.json"
        result = subprocess.run([sys.executable, str(SCRIPT), "--input", str(source),
                                 "--output", str(output)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(output.read_text())
        self.assertEqual(report["schema_version"], 1)
        self.assertEqual(len(report["files"]), 1)
        self.assertFalse(report["executed_input"])

    def test_cli_never_overwrites_an_input_file_with_its_report(self):
        source = self.root / "fixture.exe"
        original = synthetic_pe()
        source.write_bytes(original)
        result = subprocess.run([sys.executable, str(SCRIPT), "--input", str(source),
                                 "--output", str(source)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(source.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
