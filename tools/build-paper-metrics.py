#!/usr/bin/env python3
"""Build versioned paper reports from hash-checked public experiment evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from paper_metrics import SCORING_VERSION
from paper_metrics import calculate
from paper_metrics import identity


def load(path: Path):
    return json.loads(path.read_text())


def write_changed(path: Path, value):
    content = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    if not path.exists() or path.read_text() != content:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return hashlib.sha256(content.encode()).hexdigest()


def build(site: Path):
    source = site / "data/experiments"
    destination = site / "data/paper"
    manifest = load(destination / "benchmark-v1.json")
    catalog = load(source / "catalog.json")
    index = {"schema_version": 1, "scoring_version": SCORING_VERSION,
             "manifest_sha256": identity(manifest),
             "engine_sha256": hashlib.sha256(Path(__file__).with_name("paper_metrics.py").read_bytes()).hexdigest(),
             "default_analysis": catalog.get("default_analysis"),
             "source": catalog.get("source"), "reports": []}
    for entry in catalog["releases"]:
        def verified(relative):
            path = Path(relative)
            if path.is_absolute() or ".." in path.parts or path.suffix != ".json":
                raise ValueError("Unsafe evidence path")
            payload = (source / path).read_bytes()
            if hashlib.sha256(payload).hexdigest() != entry["files"].get(relative):
                raise ValueError(f"Evidence hash mismatch: {relative}")
            return json.loads(payload)

        analysis = verified(entry["path"])
        source_analysis_sha256 = identity(analysis)
        if analysis.get("detail_paths"):
            by_id = {c["id"]: c for path in analysis["detail_paths"].values() for c in verified(path)["cells"]}
            analysis["cells"] = [by_id[c["id"]] for c in analysis["cells"]]
        book = verified(f"pricing/{analysis['pricebook']}.json")
        protocol_ids = analysis.get("protocol_ids", [analysis["protocol"]["id"]])
        analysis["protocols"] = {key: verified(f"protocols/{key}.json") for key in protocol_ids}
        report = calculate(analysis, manifest, book)
        report["published_analysis_sha256"] = source_analysis_sha256
        report["protocol_names"] = {key: p["name"] for key, p in analysis["protocols"].items()}
        report["analysis_name"] = analysis["name"]
        report["price_metadata"] = book
        details = {"scoring_version": SCORING_VERSION, "analysis_id": entry["id"],
                   "manifest_sha256": report["manifest_sha256"],
                   "groups": [{"id": group["id"], "config": group["config"],
                               "checkpoint_records": group.pop("checkpoint_records")} for group in report["groups"]]}
        details_path = f"records/{entry['id']}.json"
        details_hash = write_changed(destination / details_path, details)
        report["checkpoint_records_path"] = details_path
        report["checkpoint_records_sha256"] = details_hash
        path = f"reports/{entry['id']}.json"
        file_hash = write_changed(destination / path, report)
        index["reports"].append({"analysis_id": entry["id"], "path": path, "sha256": file_hash})
    write_changed(destination / "catalog.json", index)
    return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    result = build(args.site)
    print(f"Built {len(result['reports'])} paper reports ({result['scoring_version']})")
