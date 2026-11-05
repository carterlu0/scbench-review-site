"""Project applicable display counts without changing raw or scored evidence."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy


def project_display_counts(cells, records, inventories):
    scored = {
        (row["cell_id"], row["checkpoint_id"]): row
        for group in records
        for row in group["checkpoint_records"]
    }
    for cell in cells:
        if cell["mode"] != "pipeline":
            continue
        for cp in cell["checkpoints"]:
            row = scored.get((cell["id"], cp["target_checkpoint"]))
            if (cell["problem"] in {"clint_t1", "serv_t1"}
                    and cp["state"] in {"passed", "failed"}
                    and row and row.get("groups")):
                counts = {
                    name: {"passed": group["passed"], "total": group["expected"]}
                    for name, group in row["groups"].items()
                }
                counts["total"] = {
                    name: sum(group[name] for group in counts.values())
                    for name in ("passed", "total")
                }
                cp["display_test_counts"] = counts
                cp["display_test_counts_source"] = "scored_checkpoint_groups"
            # An unexecuted final has an expected applicable population, never
            # an observed result. Bind this reviewed inventory to exact cells.
            if cp["state"] != "stopped_by_policy":
                continue
            for inventory in inventories:
                if ((cell["problem"], cp["target_checkpoint"])
                        != (inventory["problem"], inventory["target_checkpoint"])):
                    continue
                binding = {"cell_id": cell["id"],
                           "evaluation_generation": cell["evaluation_generation"]}
                if binding not in inventory["bindings"]:
                    continue
                tests = inventory["tests"]
                excluded = set(inventory["non_applicable_test_ids"])
                assert excluded <= {test["nodeid"] for test in tests}
                groups = Counter(test["group"].lower() for test in tests
                                 if test["nodeid"] not in excluded)
                cp["display_expected_test_counts"] = {
                    "total": sum(groups.values()), "groups": dict(groups),
                    "source": deepcopy(inventory["source"]),
                    "policy": "reviewed_applicable_inventory_not_executed",
                }
