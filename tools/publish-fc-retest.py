#!/usr/bin/env python3
"""Publish a completed FC evaluator-only re-evaluation to the review site.

The input analysis is copied as public evidence after the caller has supplied a
sanitized analysis.  No model or evaluator is invoked here.  The script keeps
the old experiment and paper releases immutable, adds a new release, and
builds the corresponding FDR/CC/FC/CPR report from the supplied manifest.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from paper_metrics import identity


def compact(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def write(path: Path, value) -> str:
    text = compact(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return hashlib.sha256(text.encode()).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def publish(site: Path, analysis_path: Path, manifest_path: Path, pricebook_path: Path) -> str:
    source = json.loads(analysis_path.read_text())
    manifest = json.loads(manifest_path.read_text())
    pricebook = json.loads(pricebook_path.read_text())
    completion_path = analysis_path.parent.parent / "summary.json"
    completion = json.loads(completion_path.read_text())
    if not (completion.get("publishable") is True and completion.get("all_retests_complete") is True
            and completion.get("completed_jobs") == completion.get("total_jobs")
            and completion.get("agent_invocations") == 0
            and completion.get("identity_failures") == []
            and completion.get("version") == source.get("fc_repair", {}).get("version")):
        raise ValueError("Re-evaluation is incomplete or evidence identity is unverified")
    if set(source["fc_repair"]["evaluations"]) != {j["evaluation"] for j in completion["jobs"]}:
        raise ValueError("Published evaluations differ from completed jobs")
    published_price_path = site / "data/experiments" / f"pricing/{source['pricebook']}.json"
    if json.loads(published_price_path.read_text()) != pricebook:
        raise ValueError("Supplied pricebook differs from published dependency")
    source_hash = identity(source)
    contract_version = source["fc_repair"]["version"]
    suffix = contract_version.rsplit("-", 1)[-1]
    if not re.fullmatch(r"v[2-9][0-9]*", suffix):
        raise ValueError("Unsupported FC repair release version")
    release_version = f"fc-retest-{suffix}"
    release_id = hashlib.sha256(f"evortl-{release_version}:{source_hash}".encode()).hexdigest()

    public = copy.deepcopy(source)
    public["id"] = release_id
    public["name"] = (
        "GPT-6-Luna / Codex: 15 problems, Low / Medium / High / xhigh "
        f"({len(source['cells'])} trials) · FC evaluator-only re-evaluation {suffix} "
        f"· {completion['completed_jobs']} retests complete"
    )
    # Every checkpoint is inline in this export.  Retaining the old release's
    # detail paths would make the browser look up old cell IDs after the retry.
    public["detail_paths"] = {}
    public["publication"] = {
        "kind": "evaluator_only_retest",
        "version": release_version,
        "source_analysis_id": source.get("id"),
        "source_analysis_sha256": source_hash,
        "agent_invocations": 0,
        "completed_jobs": completion["completed_jobs"],
        "total_jobs": completion["total_jobs"],
        "derived_cells": completion["derived_cells"],
        "evidence_identity_failures": completion["identity_failures"],
        "completion_summary_sha256": sha256_file(completion_path),
        "parent_repair": source["fc_repair"].get("parent_repair"),
    }
    analysis_rel = f"analyses/{release_id}.json"
    analysis_file = site / "data/experiments" / analysis_rel
    analysis_hash = write(analysis_file, public)

    # Keep the dependencies explicit so the existing synchronizer and the
    # paper report builder can verify the release without private paths.
    files = {analysis_rel: analysis_hash}
    for rel in [
        f"pricing/{public['pricebook']}.json",
        *[f"protocols/{protocol_id}.json" for protocol_id in public.get("protocol_ids", [])],
    ]:
        path = site / "data/experiments" / rel
        if not path.exists():
            raise FileNotFoundError(path)
        files[rel] = sha256_file(path)

    experiments_catalog_path = site / "data/experiments/catalog.json"
    experiments_catalog = json.loads(experiments_catalog_path.read_text())
    manifest_rel = f"benchmark-{release_version}.json"
    write(site / "data/paper" / manifest_rel, manifest)
    entry = {
        "id": release_id,
        "name": public["name"],
        "path": analysis_rel,
        "files": files,
        "created_at": public["created_at"],
        "paper_manifest": manifest_rel,
        "paper_manifest_sha256": identity(manifest),
    }
    releases = [r for r in experiments_catalog["releases"] if r["id"] != release_id]
    releases.append(entry)
    experiments_catalog["releases"] = releases
    experiments_catalog["default_analysis"] = release_id
    experiments_catalog_path.write_text(json.dumps(experiments_catalog, ensure_ascii=False, indent=2) + "\n")

    local_path = site / "data/experiments/site-releases.json"
    local = json.loads(local_path.read_text()) if local_path.exists() else {"schema_version": 1, "releases": []}
    local["releases"] = [r for r in local["releases"] if r["id"] != release_id] + [entry]
    local["default_analysis"] = release_id
    write(local_path, local)
    subprocess.run([sys.executable, str(Path(__file__).with_name("build-paper-metrics.py")),
                    "--site", str(site)], check=True)
    return release_id


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--pricebook", type=Path, required=True)
    args = parser.parse_args()
    print(publish(args.site, args.analysis, args.manifest, args.pricebook))
