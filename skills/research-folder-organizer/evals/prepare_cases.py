#!/usr/bin/env python3
"""Create isolated evaluation inputs under a new directory; never run model tasks."""

import argparse
import hashlib
import json
from pathlib import Path


def prepare(destination):
    destination = Path(destination).expanduser().resolve()
    if destination.exists():
        raise FileExistsError(f"Target already exists; refusing overwrite: {destination}")
    cases = json.loads(Path(__file__).with_name("cases.json").read_text(encoding="utf-8"))["cases"]
    # Validate every path before creating any fixtures.
    ids = set()
    for case in cases:
        case_id = case["id"]
        if case_id in ids or not case_id or Path(case_id).name != case_id or case_id in {".", ".."}:
            raise ValueError(f"Invalid or repeated case ID: {case_id}")
        ids.add(case_id)
        for name in case["files"]:
            path = Path(name)
            if path.is_absolute() or path.drive or ".." in path.parts:
                raise ValueError(f"Unsafe fixture path: {name}")
            if not (destination / case_id / "project" / path).resolve().is_relative_to(destination):
                raise ValueError(f"Fixture escapes destination: {name}")
    destination.mkdir(parents=True, exist_ok=False)
    tasks = []
    baseline = {}
    for case in cases:
        project = destination / case["id"] / "project"
        if case.get("project_exists", True):
            project.mkdir(parents=True)
        for name, content in case["files"].items():
            target = project / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("w", encoding="utf-8", newline="") as stream:
                stream.write(content)
            baseline[target.relative_to(destination).as_posix()] = {
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                "mtime_ns": target.stat().st_mtime_ns,
            }
        tasks.append({
            "id": case["id"],
            "project": str(project),
            "prompt": case["prompt"].replace("{project}", str(project)),
        })
    (destination / "tasks.json").write_text(json.dumps(tasks, ensure_ascii=False, indent=2), encoding="utf-8")
    (destination / "baseline.json").write_text(json.dumps(baseline, ensure_ascii=False, indent=2), encoding="utf-8")
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", help="New directory for generated evaluation inputs")
    args = parser.parse_args()
    try:
        output = prepare(args.destination)
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(2, f"Preparation failed: {exc}\n")
    print(f"Created fixtures and tasks.json at: {output}")
    print("No model evaluation has been executed. Expected checks remain in evals/cases.json.")


if __name__ == "__main__":
    main()
