#!/usr/bin/env python3
"""Read-only PE/ZIP metadata inspection. Never loads or executes input code."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import ntpath
import os
from pathlib import Path, PurePosixPath
import stat
import struct
import sys
import zipfile


MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_FILES = 32
MAX_ZIP_ENTRIES = 10_000
MAX_MEMBER_BYTES = 2 * 1024 * 1024
MAX_TOTAL_MEMBER_BYTES = 8 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
TERMS = (
    "ItemTable", "ModTable", "ModEffectTable", "EffectID", "config_id",
    "traditionalchinese", "zh_TW", "5500101", "5500103", "5500203", "5500303",
    "力量加持", "特攻傷害", "特攻伤害", "特攻傷害加持", "抵禦魔法",
    "極·生命吸取", "極-生命汲取", "模組", "模组",
)
DICTIONARY_FILES = {
    "itemtable.json", "modtable.json", "modeffecttable.json", "modtypetable.json",
    "module_types.py", "itemtable.csv", "modeffecttable.csv",
}
SENSITIVE_PARTS = (
    "secret", "credential", "token", "password", "account", "player", "profile",
    "inventory", "session", "cookie", "private", ".env", "cache", "config/",
)
RESOURCE_TYPES = {
    1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG", 6: "STRING",
    9: "ACCELERATOR", 10: "RCDATA", 11: "MESSAGETABLE", 12: "GROUP_CURSOR",
    14: "GROUP_ICON", 16: "VERSION", 24: "MANIFEST",
}


def term_counts(data):
    return {term: {"utf8": data.count(term.encode("utf-8")),
                   "utf16le": data.count(term.encode("utf-16le"))} for term in TERMS}


def read_values(data, fmt, offset):
    size = struct.calcsize(fmt)
    if offset < 0 or offset + size > len(data):
        raise ValueError("truncated structure")
    return struct.unpack_from(fmt, data, offset)


def align4(value):
    return (value + 3) & ~3


def version_strings(data):
    """Read only four allowed standard version fields, never arbitrary strings."""
    found = {}
    allowed = {"ProductName", "ProductVersion", "FileVersion", "FileDescription"}

    def walk(offset, limit, depth=0):
        if depth > 8 or offset + 6 > limit:
            return
        length, value_length, kind = read_values(data, "<HHH", offset)
        end = offset + length
        if length < 8 or end > limit:
            return
        cursor = offset + 6
        key_end = cursor
        while key_end + 2 <= end and data[key_end:key_end + 2] != b"\0\0":
            key_end += 2
        if key_end + 2 > end:
            return
        key = data[cursor:key_end].decode("utf-16le", errors="replace")
        cursor = align4(key_end + 2)
        value_bytes = value_length * 2 if kind == 1 else value_length
        if cursor + value_bytes > end:
            return
        if key in allowed and kind == 1 and value_bytes <= 512:
            text = data[cursor:cursor + value_bytes].decode("utf-16le", errors="replace").rstrip("\0")
            found[key] = "".join(c for c in text if c.isprintable())[:120]
        child = align4(cursor + value_bytes)
        while child + 6 <= end:
            child_size, = read_values(data, "<H", child)
            if child_size < 8 or child + child_size > end:
                break
            walk(child, end, depth + 1)
            child = align4(child + child_size)

    walk(0, len(data))
    return found


def inspect_pe(data):
    try:
        pe, = read_values(data, "<I", 0x3C)
        if data[pe:pe + 4] != b"PE\0\0":
            raise ValueError("missing PE signature")
        machine, count = read_values(data, "<HH", pe + 4)
        optional_size, = read_values(data, "<H", pe + 20)
        optional = pe + 24
        magic, = read_values(data, "<H", optional)
        if magic not in (0x10B, 0x20B) or count > 96:
            raise ValueError("unsupported optional header or section count")
        if optional + optional_size + count * 40 > len(data):
            raise ValueError("truncated headers")
        sections = []
        for index in range(count):
            offset = optional + optional_size + index * 40
            name = data[offset:offset + 8].rstrip(b"\0").decode("ascii", errors="replace")
            virtual_size, rva, raw_size, raw_offset = read_values(data, "<IIII", offset + 8)
            if raw_size and raw_offset + raw_size > len(data):
                raise ValueError("section exceeds file bounds")
            sections.append({"name": name, "virtual_size": virtual_size, "rva": rva,
                             "raw_size": raw_size, "raw_offset": raw_offset})
        indicators = []
        names = {section["name"].lower() for section in sections}
        if ".themida" in names:
            indicators.append("Themida section marker")
        if any(name.startswith("upx") for name in names):
            indicators.append("UPX section marker")
        if any(name.startswith(".vmp") for name in names):
            indicators.append("VMProtect section marker")

        def file_offset(rva, size):
            for section in sections:
                displacement = rva - section["rva"]
                if 0 <= displacement and displacement + size <= section["raw_size"]:
                    return section["raw_offset"] + displacement
            raise ValueError("resource RVA is outside stored sections")

        resources = []
        versions = {}
        warnings = []
        directory_base = optional + (112 if magic == 0x20B else 96)
        number_offset = optional + (108 if magic == 0x20B else 92)
        if number_offset + 4 > optional + optional_size:
            raise ValueError("optional header has no data directory count")
        directory_count, = read_values(data, "<I", number_offset)
        if directory_count > 2 and directory_base + 24 <= optional + optional_size:
            resource_rva, resource_size = read_values(data, "<II", directory_base + 16)
            if resource_rva and resource_size:
                try:
                    root = file_offset(resource_rva, resource_size)
                    visited = set()

                    def resource_read(fmt, relative):
                        if relative < 0 or relative + struct.calcsize(fmt) > resource_size:
                            raise ValueError("resource structure exceeds directory bounds")
                        return read_values(data, fmt, root + relative)

                    def walk(relative, path):
                        if relative in visited or len(path) > 4 or len(visited) >= 512:
                            raise ValueError("resource cycle or traversal limit")
                        visited.add(relative)
                        named, numbered = resource_read("<HH", relative + 12)
                        if named + numbered > 512:
                            raise ValueError("resource entry limit")
                        for index in range(named + numbered):
                            identifier, target = resource_read("<II", relative + 16 + index * 8)
                            # Do not print custom resource strings from unknown programs.
                            key = "<named>" if identifier & 0x80000000 else identifier
                            child_path = path + [key]
                            if target & 0x80000000:
                                walk(target & 0x7FFFFFFF, child_path)
                            else:
                                rva, size, codepage, _ = resource_read("<IIII", target)
                                position = file_offset(rva, size)
                                kind = RESOURCE_TYPES.get(child_path[0], "OTHER")
                                resources.append({"type": kind, "path": child_path,
                                                  "size_bytes": size, "codepage": codepage})
                                if len(resources) > 512:
                                    raise ValueError("resource leaf limit")
                                if kind == "VERSION" and size <= 65536:
                                    versions.update(version_strings(data[position:position + size]))
                    walk(0, [])
                except ValueError as error:
                    warnings.append(f"Resource parsing stopped: {error}")
        last_raw = max((s["raw_offset"] + s["raw_size"] for s in sections), default=len(data))
        return {"architecture": {0x8664: "x64", 0x14C: "x86", 0xAA64: "arm64"}.get(machine, hex(machine)),
                "sections": sections, "resources": resources, "version": versions,
                "protection_indicators": indicators,
                "trailing_bytes": max(0, len(data) - last_raw), "warnings": warnings}
    except (ValueError, struct.error) as error:
        raise ValueError(f"Invalid PE: {error}") from error


def safe_member_path(name):
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    return (not path.is_absolute() and not ntpath.splitdrive(normalized)[0]
            and ".." not in path.parts and "\0" not in normalized)


def inspect_zip(path):
    entries = []
    scanned_bytes = 0
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise ValueError("ZIP entry count exceeds 10000; content inspection skipped")
        for info in infos:
            normalized = info.filename.replace("\\", "/")
            lowered = normalized.lower()
            candidate = PurePosixPath(lowered).name in DICTIONARY_FILES
            entry = {"path": info.filename, "size_bytes": info.file_size,
                     "compressed_bytes": info.compress_size, "dictionary_candidate": candidate,
                     "content_scan": "metadata only"}
            mode = info.external_attr >> 16
            if not safe_member_path(normalized) or stat.S_ISLNK(mode):
                entry["content_scan"] = "skipped unsafe path"
            elif any(part in lowered for part in SENSITIVE_PARTS):
                entry["content_scan"] = "skipped sensitive path"
            elif candidate and not info.is_dir():
                if info.flag_bits & 1:
                    entry["content_scan"] = "skipped encrypted member"
                elif (info.file_size > MAX_MEMBER_BYTES
                      or info.file_size > max(info.compress_size, 1) * MAX_COMPRESSION_RATIO
                      or scanned_bytes + info.file_size > MAX_TOTAL_MEMBER_BYTES):
                    entry["content_scan"] = "skipped size or compression limit"
                else:
                    try:
                        with archive.open(info) as member:
                            content = member.read(MAX_MEMBER_BYTES + 1)
                        if len(content) > MAX_MEMBER_BYTES:
                            entry["content_scan"] = "skipped size or compression limit"
                        else:
                            scanned_bytes += len(content)
                            entry["content_scan"] = "fixed dictionary terms only"
                            entry["dictionary_terms"] = term_counts(content)
                    except (OSError, RuntimeError, NotImplementedError, zipfile.BadZipFile):
                        entry["content_scan"] = "unreadable member"
            entries.append(entry)
    return {"entry_count": len(entries), "scanned_content_bytes": scanned_bytes, "entries": entries}


def inspect_file(path):
    path = Path(path)
    report = {"name": path.name, "status": "ok", "format": "unknown"}
    try:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            return {**report, "status": "skipped", "reason": "Only regular files are inspected; symlinks are not followed"}
        report["size_bytes"] = metadata.st_size
        if metadata.st_size > MAX_FILE_BYTES:
            return {**report, "status": "skipped", "reason": "File exceeds 256 MiB limit"}
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        report["sha256"] = digest.hexdigest()
        with path.open("rb") as source:
            magic = source.read(4)
        if magic.startswith(b"MZ"):
            report["format"] = "PE"
            data = path.read_bytes()
            report["pe"] = inspect_pe(data)
            report["dictionary_terms"] = term_counts(data)
        elif zipfile.is_zipfile(path):
            report["format"] = "ZIP"
            report["zip"] = inspect_zip(path)
        else:
            report["status"] = "skipped"
            report["reason"] = "Only PE and ZIP formats are supported"
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        report["status"] = "error"
        report["error"] = str(error)[:240]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("/input"), help="One file or a directory; no recursive scan")
    parser.add_argument("--output", type=Path, default=Path("/output/report.json"))
    args = parser.parse_args()
    if args.input.is_symlink() or not args.input.exists():
        parser.error("Input must exist and cannot be a symbolic link")
    paths = sorted(args.input.iterdir()) if args.input.is_dir() else [args.input]
    if len(paths) > MAX_FILES:
        parser.error("Input directory may contain at most 32 entries")
    input_paths = {path.resolve() for path in paths}
    output_path = args.output.resolve()
    if output_path in input_paths:
        parser.error("Output path must not overwrite an input file")
    if args.input.is_dir() and args.output.resolve().parent == args.input.resolve():
        parser.error("Output path must be outside the input directory")
    report = {"schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
              "executed_input": False, "network_used": False,
              "scope": "PE/ZIP metadata and fixed dictionary term counts; no extraction or protection bypass",
              "files": [inspect_file(path) for path in paths]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Refuse an output symlink so a report cannot overwrite an unintended target.
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(f"Inspected {len(paths)} input file(s); report: {args.output}")
    return 1 if any(file["status"] == "error" for file in report["files"]) else 0


if __name__ == "__main__":
    sys.exit(main())
