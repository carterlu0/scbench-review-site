"""Build the current result for each model/effort, independently of batches."""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from paper_metrics import calculate
from paper_metrics import identity
from paper_metrics import refresh_sr_regression


def load(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


def verified(path, digest):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError(f"Evidence hash mismatch: {path.name}")
    return json.loads(raw)


def load_analysis(site, catalog, analysis_id):
    entry = next(row for row in catalog["releases"] if row["id"] == analysis_id)
    source = site / "data/experiments"
    analysis = verified(source / entry["path"], entry["files"][entry["path"]])
    if analysis.get("detail_paths"):
        cells = {c["id"]: c for p in analysis["detail_paths"].values()
                 for c in verified(source / p, entry["files"][p])["cells"]}
        analysis["cells"] = [cells[c["id"]] for c in analysis["cells"]]
    return analysis, entry


def normalize_cells(analysis, resource_input):
    cells = deepcopy(analysis["cells"])
    inputs = resource_input["checkpoints"]
    if resource_input["source_analysis"] != analysis["id"]:
        raise ValueError("Inference resources belong to another result")
    for cell in cells:
        cell["repeat"] = 0
        for cp in cell["checkpoints"]:
            resource = inputs.get(cp["planned_unit_id"])
            if resource:
                if cp.get("candidate") and (cp["candidate"] != resource["candidate"]
                        or cp["inference_sha256"] != resource["inference_sha256"]):
                    raise ValueError("Inference resource/candidate identity mismatch")
                for field in ("tokens", "inference_seconds", "started_at", "completed_at",
                              "native_steps", "calls", "inference_protocol"):
                    if field in resource:
                        cp[field] = deepcopy(resource[field])
                cp["resource_inference_sha256"] = resource["inference_sha256"]
                cp["compatibility"].update(cost="identical", time="identical")
            if cp.get("score_override", {}).get("reason") == "agent_failure":
                cp["compatibility"]["score"] = "compatible"
            inventory = cp.get("expected_test_counts")
            if inventory:
                inventory["groups"] = {g: inventory["groups"].get(g, 0)
                                       for g in ("structure", "core", "functionality", "regression", "error")}
            cp.setdefault("defects", [])
            cp.setdefault("tags", [])
            cp.setdefault("calls", {})
            cp["compatibility"].setdefault("calls", "unknown")
            cell["expected_test_counts"][cp["target_checkpoint"]] = inventory
    return cells


def compact_record(row):
    result = {k: deepcopy(row[k]) for k in ("mode", "chain_id", "checkpoint_id",
        "cell_id", "checkpoint_index", "execution_status", "strict_pass", "reason",
        "groups", "compatible", "costs", "regression_result_exclusion") if k in row}
    if result.get("groups"):
        result["groups"] = {name: {k: v for k, v in group.items()
                                 if k not in ("tests", "non_applicable")}
                            for name, group in result["groups"].items()}
    return result


def apply_record_costs(cells, rows, version):
    """Use the scored costs in trial details as well as resource summaries."""
    costs = {(r["cell_id"], r["checkpoint_id"]): r["costs"] for r in rows}
    for cell in cells:
        for cp in cell["checkpoints"]:
            projected = costs.get((cell["id"], cp["target_checkpoint"]))
            if projected is None:
                continue
            cp.setdefault("original_official_cost", deepcopy(cp.get("official_cost")))
            cp["costs"] = deepcopy(projected)
            actual = projected["actual"]
            cp["official_cost"] = {**deepcopy(actual),
                "coverage": "complete" if actual["usd"] is not None else "unknown",
                "price_version": version}
        values = [cp.get("official_cost", {}).get("usd") for cp in cell["checkpoints"]]
        cell["official_cost_selected_attempt"] = sum(values) if values and all(v is not None for v in values) else None
        cell["price_version"] = version


def verify_reused_records(group, cells):
    """An archived metric is reusable only for the same selected evidence."""
    checkpoints = {(c["id"], cp["target_checkpoint"]): cp
                   for c in cells for cp in c["checkpoints"]}
    for row in group["checkpoint_records"]:
        cp = checkpoints[(row["cell_id"], row["checkpoint_id"])]
        if row.get("score_override"):
            if row["score_override"] != cp.get("score_override"):
                raise ValueError("Archived scoring ruling differs")
            continue
        for field in ("candidate", "evaluation_sha256", "inference_sha256"):
            if field in row and row.get(field) != cp.get(field):
                raise ValueError(f"Archived metric evidence differs: {field}")
    # The selected export can contain richer delivery diagnostics than its
    # archived score report. Refresh only RFR's validity annotation, keeping
    # archived strict scores and consumption unchanged.
    refresh_sr_regression(group, group["checkpoint_records"], checkpoints)


def build(site):
    destination = site / "data/results"
    registry = load(destination / "current-groups.json")
    catalog = load(site / "data/experiments/catalog.json")
    paper_catalog = load(site / "data/paper/catalog.json")
    baseline = load(site / "data/experiments/analyses/528480512662809635a8a5dc3c2e31baaa0a0143ae9535e33a638df479192bbe.json")
    book = load(site / "data/experiments/pricing" / (baseline["pricebook"] + ".json"))
    overrides = load(site / "data/paper/price-overrides.json")
    replaced = {row["model"] for row in overrides["rates"]}
    book.update(version=overrides["version"], aggregate_request_bounds=overrides["aggregate_request_bounds"],
                temporary_failure_cost_policy=overrides.get("temporary_failure_cost_policy", {}),
                rates=[r for r in book["rates"] if r["model"] not in replaced] + overrides["rates"])
    groups, records, cells, sources, retries = [], [], [], [], []
    group_keys = set()
    for selection in registry["sources"]:
        analysis, entry = load_analysis(site, catalog, selection["analysis_id"])
        selected = [c for c in analysis["cells"] if c["model"] in selection["models"]
                    and (not selection.get("agents") or c["agent"] in selection["agents"])]
        retries.extend(row for row in analysis.get("final_suite", {}).get("observed_nonpass_attempts", [])
                       if row.get("selected_for_scoring") is False)
        if selection.get("manifest"):
            manifest = load(destination / selection["manifest"])
            selected = normalize_cells({**analysis, "cells": selected},
                                       load(destination / selection["resources"]))
            scoring_input = {**analysis, "cells": selected,
                             "protocols": {p["id"]: p for p in analysis["protocols"]}}
            calculated = calculate(scoring_input, manifest, book)
            calculated_groups = calculated["groups"]
        else:
            report_entry = next(r for r in paper_catalog["reports"]
                                if r["analysis_id"] == selection["paper_report"])
            calculated = verified(site / "data/paper" / report_entry["path"], report_entry["sha256"])
            detail = verified(site / "data/paper" / calculated["checkpoint_records_path"],
                              calculated["checkpoint_records_sha256"])
            record_map = {g["id"]: g["checkpoint_records"] for g in detail["groups"]}
            calculated_groups = [{**g, "checkpoint_records": record_map[g["id"]]}
                                 for g in calculated["groups"] if g["config"]["model"] in selection["models"]
                                 and (not selection.get("agents") or g["config"]["agent"] in selection["agents"])]
            for group in calculated_groups:
                verify_reused_records(group, selected)
        for group in calculated_groups:
            config = group["config"]
            key = (config["model"], config["agent"], config["thinking"])
            if key in group_keys:
                raise ValueError("A group has more than one current result")
            group_keys.add(key)
            binding = {c["id"] for c in selected if c["model"] == config["model"] and c["agent"] == config["agent"]
                       and c["thinking"] == config["thinking"]}
            if binding != {b["cell_id"] for b in group["configuration_bindings"]} or len(binding) != 89:
                raise ValueError("Current metric group does not bind all 89 selected trials")
            if not selection.get("allow_partial") and (group["issues"] or any(v["value"] is None for v in group["primary"].values())):
                raise ValueError(f"Unresolved scoring in current group {key}: {group['issues'][:3]}")
            group = deepcopy(group)
            rows = group.pop("checkpoint_records")
            chain_types = {r["chain_id"]: r["task_type"] for r in rows}
            for chain in group["chains"]:
                chain["task_type"] = chain_types[chain["chain_id"]]
            records.append({"id": group["id"], "config": config,
                            "checkpoint_records": [compact_record(r) for r in rows]})
            apply_record_costs([c for c in selected if c["id"] in binding], rows, book["version"])
            group["source_analysis"] = analysis["id"]
            group["updated_at"] = analysis["created_at"]
            group["publication"] = deepcopy(analysis.get("publication", {}))
            group["configuration_bindings"] = [{k: b[k] for k in ("cell_id", "protocol")}
                                               for b in group["configuration_bindings"]]
            groups.append(group)
        cells.extend(selected)
        sources.append({"analysis_id": analysis["id"], "path": entry["path"],
                        "sha256": entry["files"][entry["path"]], "models": selection["models"]})
    if len(cells) != 89 * len(groups):
        raise ValueError("Each current setting must contain its 89 planned trials")
    summary_rows, failure_rows = [], []
    for group in groups:
        config = group["config"]
        current_cells = [c for c in cells if c["model"] == config["model"] and c["agent"] == config["agent"] and c["thinking"] == config["thinking"]]
        outcomes = Counter(dict.fromkeys(("passed", "nonpassed", "stopped", "pending"), 0))
        for cell in current_cells:
            for cp in cell["checkpoints"]:
                state = cp["state"]
                zero = cp.get("score_override", {}).get("value") == 0
                key = "nonpassed" if zero else "passed" if state == "passed" else "stopped" if state == "stopped_by_policy" else "pending" if state in {"pending", "running", "missing", "awaiting_evaluation", "evaluation_error"} else "nonpassed"
                outcomes[key] += 1
                if key == "nonpassed":
                    failure_rows.append({"model": cell["model"], "agent": cell["agent"], "effort": cell["thinking"],
                        "problem": cell["problem"], "mode": cell["mode"], "cell_id": cell["id"],
                        "target_checkpoint": cp["target_checkpoint"],
                        "category": "agent_failure" if zero else cp.get("nonpass_category") or ("interface_mismatch" if cp.get("candidate_failure") else "implementation_error"),
                        "subtype": "delivery_timeout" if zero and cp.get("score_override", {}).get("classification") == "delivery_timeout" else cp.get("nonpass_subtype") or "observable_test_failure"})
        summary_rows.append({"model": config["model"], "agent": config["agent"], "agent_version": config["agent_version"], "thinking": config["thinking"],
                             "scored_trials": sum(c["score"] is not None for c in current_cells), "planned_trials": len(current_cells),
                             "planned": sum(outcomes.values()), **outcomes})
    details = {}
    for problem in sorted({c["problem"] for c in cells}):
        payload = {"cells": [c for c in cells if c["problem"] == problem]}
        relative = f"details/{identity(payload)}.json"
        digest = write(destination / relative, payload)
        details[problem] = {"path": relative, "sha256": digest}
    overview = []
    for cell in cells:
        short = {k: deepcopy(v) for k, v in cell.items() if k in (
            "id", "problem", "mode", "prompt_arm", "model", "agent", "agent_version",
            "thinking", "protocol", "formal", "progression_policy", "status", "outcome",
            "score", "score_override", "generation", "evaluation_generation", "planned_targets", "expected_test_counts",
            "official_cost_selected_attempt", "price_version")}
        short["checkpoints"] = [{k: deepcopy(cp[k]) for k in ("target_checkpoint", "state",
            "gate_passed", "candidate_failure", "score_override", "expected_test_counts", "test_counts",
            ) if k in cp} | {"official_cost": {k: cp.get("official_cost", {}).get(k)
                                            for k in ("usd", "coverage", "reason", "price_version")}}
                               for cp in cell["checkpoints"]]
        overview.append(short)
    report = {k: calculated.get(k) for k in ("schema_version", "scoring_version", "policies")}
    report.update(view="latest", analysis_id="latest", benchmark_version="latest-by-model-setting",
                  manifest_sha256=identity(registry), groups=groups,
                  price_version=book["version"], price_metadata=book)
    result = {"schema_version": 1, "updated_at": max(g["updated_at"] for g in groups),
              "sources": sources, "report": report, "records": {"groups": records},
              "cells": overview, "details": details, "group_status": summary_rows,
              "nonpass_units": failure_rows, "nonselected_failures": retries}
    write(destination / "latest.json", result)
    print(json.dumps({"groups": len(groups), "cells": len(cells), "nonpass": len(failure_rows),
                      "metrics": [{"model": g["config"]["model"], "effort": g["config"]["thinking"],
                                   **{k: v["value"] for k, v in g["primary"].items()}} for g in groups]}, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    build(parser.parse_args().site)
