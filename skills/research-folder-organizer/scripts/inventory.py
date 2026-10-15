#!/usr/bin/env python3
"""Read-only metadata inventory. Exit: 0 complete, 1 partial, 2 invalid root."""

import argparse
import json
import os
from pathlib import Path
import stat
import sys
from datetime import datetime, timezone


EXCLUDED = {".git", ".hg", ".svn", ".venv", "venv", "node_modules", "__pycache__"}
REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


def is_link(info):
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & REPARSE_POINT
    )


def utc_time(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def inventory(root):
    root = Path(os.path.abspath(os.path.expanduser(str(root))))
    report = {
        "root": str(root),
        "generated_at_utc": utc_time(datetime.now(timezone.utc).timestamp()),
        "complete": False,
        "entries": [],
        "skipped": [],
        "errors": [],
    }

    def error(path, operation, exc):
        report["errors"].append({
            "path": path,
            "operation": operation,
            "error": f"{type(exc).__name__}: {exc}",
        })

    def finish(code):
        entries = report["entries"]
        entries.sort(key=lambda item: (item["path"].casefold(), item["path"]))
        report["skipped"].sort(key=lambda item: item["path"])
        report["summary"] = {
            "entries": len(entries),
            "files": sum(item["kind"] == "file" for item in entries),
            "directories": sum(item["kind"] == "directory" for item in entries),
            "links": sum(item["kind"] == "link" for item in entries),
            "other": sum(item["kind"] == "other" for item in entries),
            "total_file_bytes": sum(item["size_bytes"] for item in entries if item["kind"] == "file"),
            "skipped_directories": len(report["skipped"]),
            "errors": len(report["errors"]),
        }
        report["complete"] = code == 0
        return report, code

    try:
        info = root.lstat()
        if is_link(info):
            raise ValueError("Root must not be a symbolic link, junction, or reparse point")
        if not stat.S_ISDIR(info.st_mode):
            raise ValueError("Root must be a directory")
    except (OSError, ValueError) as exc:
        error(".", "validate_root", exc)
        return finish(2)

    pending = [(root, ".")]
    root_failed = False
    while pending:
        directory, relative = pending.pop()
        try:
            # Recheck queued directories so a replaced directory is not followed.
            info = directory.lstat()
            if is_link(info) or not stat.S_ISDIR(info.st_mode):
                raise ValueError("Directory became a link/reparse point or is no longer a directory")
            with os.scandir(directory) as iterator:
                children = sorted(iterator, key=lambda item: (item.name.casefold(), item.name))
        except (OSError, ValueError) as exc:
            error(relative, "scan_directory", exc)
            root_failed = root_failed or relative == "."
            continue

        for child in children:
            path = Path(child.path)
            relative_path = path.relative_to(root).as_posix()
            try:
                info = child.stat(follow_symlinks=False)
                if is_link(info):
                    kind = "link"
                elif stat.S_ISDIR(info.st_mode):
                    kind = "directory"
                elif stat.S_ISREG(info.st_mode):
                    kind = "file"
                else:
                    kind = "other"
                if kind == "directory" and child.name.casefold() in EXCLUDED:
                    report["skipped"].append({
                        "path": relative_path,
                        "reason": "excluded_directory",
                    })
                    continue
                report["entries"].append({
                    "path": relative_path,
                    "kind": kind,
                    "size_bytes": info.st_size if kind == "file" else None,
                    "mtime_utc": utc_time(info.st_mtime),
                    "extension": path.suffix.lower() if kind == "file" else "",
                })
                if kind == "directory":
                    pending.append((path, relative_path))
            except (OSError, ValueError, OverflowError) as exc:
                error(relative_path, "read_metadata", exc)

    return finish(2 if root_failed else 1 if report["errors"] else 0)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only research-folder inventory; UTF-8 JSON to stdout. No file contents are read."
    )
    parser.add_argument("root", help="Existing directory; links, junctions and reparse points are rejected")
    args = parser.parse_args(argv)
    report, code = inventory(args.root)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
