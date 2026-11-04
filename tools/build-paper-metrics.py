#!/usr/bin/env python3
"""Build versioned paper reports from hash-checked public experiment evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from paper_metrics import SCORING_VERSION
from paper_metrics import calculate
from paper_metrics import checkpoint_cost
from paper_metrics import identity
from paper_metrics import summarize
from paper_metrics import refresh_sr_regression


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_changed(path: Path, value):
    content = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    payload = content.encode("utf-8")
    if not path.exists() or path.read_bytes() != payload:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def apply_price_overrides(book, analysis, overrides):
    """Apply site-owned prices without rewriting immutable source evidence."""
    models = {cell["model"] for cell in analysis.get("cells", [])}
    rates = [rate for rate in overrides.get("rates", []) if rate["model"] in models]
    if not rates:
        return book
    replaced = {rate["model"] for rate in rates}
    effective = {**book, "version": overrides["version"],
                 "rates": [rate for rate in book.get("rates", [])
                           if rate["model"] not in replaced] + rates,
                 "source_pricebook_sha256": identity(book),
                 "override_sha256": identity(overrides),
                 "aggregate_request_bounds": [rule for rule in overrides.get("aggregate_request_bounds", [])
                                              if rule["model"] in replaced],
                 "temporary_failure_cost_policy": overrides.get("temporary_failure_cost_policy", {}),
                 "notes": overrides.get("notes", "Site-owned pricing override")}
    effective.pop("id", None)
    effective["id"] = identity(effective)
    return effective


def reprice_report(report, details, analysis, manifest, book):
    """Refresh prices from saved usage while preserving scores and timings."""
    def update_costs(target, refreshed):
        for key, resource in target["resources"].items():
            resource.update({name: value for name, value in refreshed["resources"][key].items()
                             if "cost" in name})
        for key, efficiency in target["efficiencies"].items():
            efficiency.update({name: value for name, value in refreshed["efficiencies"][key].items()
                               if "cost" in name})

    cells = {cell["id"]: cell for cell in analysis["cells"]}
    detail_groups = {group["id"]: group for group in details["groups"]}
    for group in report["groups"]:
        rows = detail_groups[group["id"]]["checkpoint_records"]
        for row in rows:
            cell = cells.get(row.get("cell_id"))
            if not cell or row["execution_status"] != "executed":
                continue
            checkpoint = next((cp for cp in cell["checkpoints"]
                               if cp["target_checkpoint"] == row["checkpoint_id"]), None)
            if checkpoint is None:
                continue
            checkpoint = {**checkpoint, "tokens": row.get("usage") or checkpoint.get("tokens")}
            for policy in ("actual", "fixed_85"):
                old = row["costs"][policy]
                cost = checkpoint_cost(checkpoint, cell, book, policy)
                if old.get("imputed"):
                    cost = {**old, "price_version": book["version"],
                            "original_cost": cost}
                row["costs"][policy] = cost
        refreshed = summarize(rows, manifest["chains"], group["config"]["formal"], report["policies"]["timing"])
        update_costs(group, refreshed)
        for task_type, subset in group.get("by_task_type", {}).items():
            chains = [chain for chain in manifest["chains"] if chain["task_type"] == task_type]
            chain_ids = {chain["id"] for chain in chains}
            refreshed = summarize([row for row in rows if row["chain_id"] in chain_ids],
                                  chains, group["config"]["formal"], report["policies"]["timing"])
            update_costs(subset, refreshed)
    report.update(price_version=book["version"], pricebook_sha256=identity(book), price_metadata=book)


def build(site: Path, rebuild: bool = False):
    source = site / "data/experiments"
    destination = site / "data/paper"
    default_manifest = load(destination / "benchmark-v1.json")
    catalog = load(source / "catalog.json")
    previous = load(destination / "catalog.json") if (destination / "catalog.json").exists() else {}
    previous_reports = {r["analysis_id"]: r for r in previous.get("reports", [])}
    override_path = destination / "price-overrides.json"
    overrides = load(override_path) if override_path.exists() else {}
    index = {"schema_version": 1, "scoring_version": SCORING_VERSION,
             "manifest_sha256": identity(default_manifest),
             "engine_sha256": hashlib.sha256(Path(__file__).with_name("paper_metrics.py").read_bytes()).hexdigest(),
             "default_analysis": catalog.get("default_analysis"),
             "source": catalog.get("source"), "reports": []}
    for entry in catalog["releases"]:
        manifest = default_manifest
        manifest_relative = entry.get("paper_manifest")
        if manifest_relative:
            manifest_path = Path(manifest_relative)
            if manifest_path.is_absolute() or ".." in manifest_path.parts or manifest_path.suffix != ".json":
                raise ValueError("Unsafe paper manifest path")
            manifest = load(destination / manifest_path)
            if identity(manifest) != entry.get("paper_manifest_sha256"):
                raise ValueError("Paper manifest hash mismatch")
            if entry["id"] == catalog.get("default_analysis"):
                index["latest_manifest_path"] = manifest_relative
                index["latest_manifest_sha256"] = identity(manifest)
        def verified(relative):
            path = Path(relative)
            if path.is_absolute() or ".." in path.parts or path.suffix != ".json":
                raise ValueError("Unsafe evidence path")
            payload = (source / path).read_bytes()
            if hashlib.sha256(payload).hexdigest() != entry["files"].get(relative):
                raise ValueError(f"Evidence hash mismatch: {relative}")
            return json.loads(payload)

        analysis = verified(entry["path"])
        if entry.get("paper_metrics_status") == "not_recomputed":
            if not analysis.get("final_suite"):
                raise ValueError("Only a frozen-suite analysis can defer paper metrics")
            # The current checkpoint results must never inherit a paper report
            # computed from different candidates or evaluator generations.
            continue
        source_analysis_sha256 = identity(analysis)
        if analysis.get("detail_paths"):
            by_id = {c["id"]: c for path in analysis["detail_paths"].values() for c in verified(path)["cells"]}
            analysis["cells"] = [by_id[c["id"]] for c in analysis["cells"]]
        book = verified(f"pricing/{analysis['pricebook']}.json")
        book = apply_price_overrides(book, analysis, overrides)
        protocol_ids = analysis.get("protocol_ids", [analysis["protocol"]["id"]])
        analysis["protocols"] = {key: verified(f"protocols/{key}.json") for key in protocol_ids}
        cached_entry = previous_reports.get(entry["id"])
        # Published reports remain frozen when their input/evidence hashes
        # match. Current-view scorer changes must not rewrite old snapshots.
        if cached_entry and not rebuild:
            cached_path = destination / cached_entry["path"]
            cached_bytes = cached_path.read_bytes() if cached_path.exists() else b""
            if hashlib.sha256(cached_bytes).hexdigest() == cached_entry["sha256"]:
                cached = json.loads(cached_bytes)
                record_path = destination / cached["checkpoint_records_path"]
                migrate_rfr = (cached.get("scoring_version") == "evortl-paper-2026-10-28-v3"
                               and SCORING_VERSION == "evortl-paper-2026-11-04-v4")
                if ((cached.get("scoring_version") == SCORING_VERSION or migrate_rfr)
                        and cached.get("manifest_sha256") == identity(manifest)
                        and cached.get("published_analysis_sha256") == source_analysis_sha256
                        and record_path.exists()
                        and hashlib.sha256(record_path.read_bytes()).hexdigest() == cached["checkpoint_records_sha256"]):
                    reprice = cached.get("pricebook_sha256") != identity(book)
                    if reprice or migrate_rfr:
                        details = load(record_path)
                        if reprice:
                            reprice_report(cached, details, analysis, manifest, book)
                        if migrate_rfr:
                            checkpoints = {(c["id"], cp["target_checkpoint"]): cp
                                           for c in analysis["cells"] for cp in c["checkpoints"]}
                            by_group = {g["id"]: g["checkpoint_records"] for g in details["groups"]}
                            for group in cached["groups"]:
                                refresh_sr_regression(group, by_group[group["id"]], checkpoints)
                            cached["scoring_version"] = details["scoring_version"] = SCORING_VERSION
                            cached["policies"]["sr_regression_failure_rate"] = (
                                "binary failure among noninitial SR checkpoints with valid applicable Regression; "
                                "exclude delivery failures and missing entrypoints only from RFR")
                        cached["checkpoint_records_sha256"] = write_changed(record_path, details)
                        cached_entry = {**cached_entry, "sha256": write_changed(cached_path, cached)}
                    index["reports"].append(cached_entry)
                    continue
        report = calculate(analysis, manifest, book)
        report["published_analysis_sha256"] = source_analysis_sha256
        report["protocol_names"] = {key: p["name"] for key, p in analysis["protocols"].items()}
        report["analysis_name"] = analysis["name"]
        report["price_metadata"] = book
        if manifest_relative:
            report["benchmark_manifest_path"] = manifest_relative
        if analysis.get("publication", {}).get("kind") == "evaluator_only_retest":
            report["retest"] = analysis["publication"]
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
    parser.add_argument("--rebuild", action="store_true", help="Explicitly recompute historical reports")
    args = parser.parse_args()
    result = build(args.site, rebuild=args.rebuild)
    print(f"Built {len(result['reports'])} paper reports ({result['scoring_version']})")
