"""Portable acceptance examples from the paper, without framework dependencies."""

import unittest

from paper_metrics import calculate
from paper_metrics import estimate_cost
from paper_metrics import group_results
from paper_metrics import normalize_checkpoint
from paper_metrics import sr_regression_failure_rate


class PaperAcceptance(unittest.TestCase):
    def test_inventory_excludes_only_proven_superseded_skips(self):
        checkpoint = {"evaluation_generation": "new", "tests": [
            {"nodeid": "old_structure", "group": "Structure", "status": "skipped"},
            {"nodeid": "current_structure", "group": "Structure", "status": "passed"},
            {"nodeid": "core", "group": "Core", "status": "failed"}],
            "expected_test_counts": {"groups": {"structure": 2, "core": 1, "regression": 0, "error": 0}}}
        spec = {"non_applicable_tests": [{"nodeid": "old_structure", "mode": "pipeline", "generations": ["new"]}]}
        groups, problem = group_results(checkpoint, spec, "pipeline")
        self.assertIsNone(problem)
        self.assertEqual(groups["structure"]["expected"], 1)
        self.assertTrue(groups["structure"]["all_passed"])
        self.assertFalse(groups["core"]["all_passed"])
        checkpoint["evaluation_generation"] = "unreviewed"
        groups, problem = group_results(checkpoint, spec, "pipeline")
        self.assertIsNone(problem)
        self.assertEqual(groups["structure"]["expected"], 2)
        self.assertFalse(groups["structure"]["all_passed"])
        checkpoint["evaluation_generation"] = "new"
        checkpoint["tests"][0]["status"] = "failed"
        groups, problem = group_results(checkpoint, spec, "pipeline")
        self.assertIsNone(problem)
        self.assertEqual(groups["structure"]["expected"], 2)
        self.assertFalse(groups["structure"]["all_passed"])

    def test_paper_example(self):
        manifest = {"schema_version": 1, "benchmark_version": "paper-example", "chains": [
            {"id": chain, "task_type": "synthetic", "checkpoints": [{"id": str(i)} for i in range(n)]}
            for chain, n in (("A", 3), ("B", 2))]}
        cells = []
        for chain, pipeline, sr in (("A", [1, 0, 1], [1, 1, 1]), ("B", [1, 0], [0, 1])):
            for mode, outcomes in (("pipeline", pipeline), ("sr", sr)):
                cps = [{"target_checkpoint": str(i), "state": "passed" if value else "failed",
                        "test_counts": {"structure": {"passed": 1, "total": 1},
                                        "core": {"passed": value, "total": 1},
                                        "regression": {"passed": 0, "total": 0}},
                        "compatibility": {"score": "identical"}}
                       for i, value in enumerate(outcomes)]
                cells.append({"id": chain + mode, "problem": chain, "mode": mode,
                              "model": "m", "agent": "codex", "formal": True, "repeat": 0,
                              "planned_targets": [str(i) for i in range(len(outcomes))],
                              "status": "completed", "progression_policy": "structure-cases",
                              "checkpoints": cps})
        group = calculate({"cells": cells}, manifest, {})["groups"][0]
        self.assertEqual(group["primary"]["pipeline_fdr"]["value"], 0.5)
        self.assertAlmostEqual(group["primary"]["pipeline_cc"]["value"], 7 / 12)
        self.assertEqual(group["primary"]["pipeline_fc"]["value"], 0.5)
        self.assertEqual(group["primary"]["sr_cpr"]["value"], 0.8)
        self.assertEqual(group["auxiliary"]["sr_chain_macro"]["value"], 0.75)

    def test_provisional_agent_failure_overrides_group_with_raw_states_retained(self):
        override = {"value": 0, "reason": "agent_failure", "provisional": True}
        cell = {"id": "failed", "status": "completed", "outcome": "agent_failure", "score_override": override}
        for state in ("passed", "inference_error", "missing"):
            cp = {"state": state, "compatibility": {"score": "identical"}}
            row = normalize_checkpoint(cell, cp, {"id": "task", "checkpoints": [{"id": "checkpoint_1"}]}, {"id": "checkpoint_1"}, "pipeline", {})
            self.assertEqual(row["strict_pass"], 0)
            self.assertEqual(row["reason"], "provisional_agent_failure")
            self.assertEqual(row["raw_execution_status"], state)
            self.assertEqual(cp["state"], state)

    def test_agent_failure_auxiliaries_count_zero_without_fabricating_groups(self):
        for regression_total in (0, 1):
            manifest = {"schema_version": 1, "benchmark_version": "agent-failure", "chains": [
                {"id": "task", "task_type": "synthetic", "checkpoints": [{"id": "checkpoint_1"}]}]}
            cells = []
            for mode in ("pipeline", "sr"):
                cells.append({"id": mode, "problem": "task", "mode": mode,
                    "model": "m", "agent": "codex", "formal": True, "repeat": 0,
                    "planned_targets": ["checkpoint_1"], "status": "completed",
                    "outcome": "agent_failure", "progression_policy": "structure-cases",
                    "score_override": {"value": 0, "reason": "agent_failure", "provisional": True},
                    "expected_test_counts": {"checkpoint_1": {"groups": {
                        "core": 2, "regression": regression_total, "structure": 1}}},
                    "checkpoints": [{"target_checkpoint": "checkpoint_1", "state": "inference_error",
                        "compatibility": {"score": "identical"}}]})
            group = calculate({"cells": cells}, manifest, {})["groups"][0]
            for key in ("pipeline_core_pass_rate", "sr_core_pass_rate", "sr_core_completion"):
                self.assertEqual(group["auxiliary"][key]["value"], 0)
                self.assertEqual(group["auxiliary"][key]["known_units"], 1)
            regression = group["auxiliary"]["sr_regression_failure_rate"]
            # Agent failure still scores zero elsewhere, but has no valid
            # Regression observation (and this is a chain-initial checkpoint).
            self.assertEqual(regression["denominator"], 0)
            self.assertIsNone(regression["value"])
            for row in group["checkpoint_records"]:
                self.assertIsNone(row["groups"])
                self.assertEqual(row["raw_execution_status"], "inference_error")
            # Unknown group sizes remain unavailable, even for a counted failure.
            for cell in cells:
                cell.pop("expected_test_counts")
            unknown = calculate({"cells": cells}, manifest, {})["groups"][0]
            self.assertIsNone(unknown["auxiliary"]["sr_regression_failure_rate"]["value"])
            self.assertIsNone(unknown["auxiliary"]["sr_core_completion"]["value"])

    def test_sr_rfr_counts_checkpoint_events_not_failed_test_fraction(self):
        def row(index, passed, total=10, **extra):
            return {"mode": "sr", "checkpoint_index": index,
                    "execution_status": "executed", "groups": {"regression": {
                        "applicable": total > 0, "expected": total, "passed": passed,
                        "failed": total - passed, "error": 0, "not_executed": 0}}, **extra}
        initial = row(1, 0, checkpoint_id="checkpoint_2")
        partial = row(2, 9, checkpoint_id="checkpoint_3")
        # Actual all-zero Regression results count, even if other groups fail.
        all_failed = row(3, 0)
        all_failed["groups"].update(structure={"all_passed": False}, core={"all_passed": False})
        passed = row(4, 10)
        no_regression = row(5, 0, total=0)
        delivery = row(6, 0, regression_result_exclusion="delivery_failure")
        missing_entrypoint = row(7, 0, regression_result_exclusion="missing_entrypoint")
        agent_failure = row(8, 0, reason="provisional_agent_failure", groups=None)
        incomplete = row(9, 9)
        incomplete["groups"]["regression"].update(failed=0, not_executed=1)
        error = row(10, 9)
        error["groups"]["regression"].update(failed=0, error=1)
        result = sr_regression_failure_rate([
            initial, partial, all_failed, passed, no_regression, delivery,
            missing_entrypoint, agent_failure, incomplete, error], True)
        self.assertEqual(result["denominator"], 3)
        self.assertEqual(result["numerator"], 2)
        self.assertAlmostEqual(result["value"], 2 / 3)
        self.assertEqual(result["excluded_checkpoints"], {
            "chain_initial_checkpoint": 1, "no_applicable_regression": 1,
            "delivery_failure": 1, "missing_entrypoint": 1,
            "provisional_agent_failure": 1, "incomplete_regression_results": 2})
        self.assertIsNone(sr_regression_failure_rate([passed], False)["value"])

    def test_missing_entrypoint_is_excluded_only_from_sr_rfr(self):
        targets = ["checkpoint_2", "checkpoint_3"]
        manifest = {"schema_version": 1, "benchmark_version": "rfr-delivery",
                    "chains": [{"id": "task", "task_type": "synthetic",
                                "checkpoints": [{"id": t} for t in targets]}]}
        cells = []
        for mode in ("pipeline", "sr"):
            for i, target in enumerate(targets):
                cp = {"target_checkpoint": target, "state": "failed",
                      "compatibility": {"score": "identical"},
                      "test_counts": {"structure": {"passed": 1, "total": 1},
                                      "core": {"passed": 0, "total": 2},
                                      "regression": {"passed": 0, "total": 2}}}
                # Keep the pipeline executable; both steps still fail Core.
                if mode == "sr" and i == 1:
                    cp.update(nonpass_subtype="missing_entrypoint")
                    cp["test_counts"]["structure"]["passed"] = 0
                if mode == "pipeline" and i == 0:
                    cell = {"id": mode, "problem": "task", "mode": mode,
                            "model": "m", "agent": "codex", "formal": True,
                            "repeat": 0, "status": "completed", "planned_targets": targets,
                            "progression_policy": "structure-cases", "checkpoints": []}
                    cells.append(cell)
                elif mode == "sr":
                    cell = {"id": mode + target, "problem": "task", "mode": mode,
                            "model": "m", "agent": "codex", "formal": True,
                            "repeat": 0, "status": "completed", "planned_targets": [target],
                            "checkpoints": []}
                    cells.append(cell)
                cell["checkpoints"].append(cp)
        group = calculate({"cells": cells}, manifest, {})["groups"][0]
        for name in ("pipeline_fdr", "pipeline_cc", "sr_cpr"):
            self.assertEqual(group["primary"][name]["value"], 0)
        self.assertEqual(group["auxiliary"]["sr_regression_failure_rate"]["denominator"], 0)
        self.assertEqual(group["by_task_type"]["synthetic"]["auxiliary"]
                         ["sr_regression_failure_rate"]["denominator"], 0)
        failed = next(r for r in group["checkpoint_records"]
                      if r["mode"] == "sr" and r["checkpoint_index"] == 2)
        self.assertEqual(failed["strict_pass"], 0)
        self.assertEqual(failed["groups"]["regression"]["passed"], 0)
        self.assertEqual(failed["regression_result_exclusion"], "missing_entrypoint")

    def test_cache_scenarios(self):
        book = {"version": "synthetic", "currency": "USD", "unit": "per_million_tokens",
                "rates": [{"model": "m", "input": 2, "output": 10, "cache_read": 0.2, "cache_write": 2.5}]}
        usage = {"input": 1000, "output": 100, "cache_read": 800, "cache_write": 50, "reasoning": 80}
        self.assertAlmostEqual(estimate_cost(usage, book, "m", "inclusive_cache")["usd"], 0.001585)
        self.assertAlmostEqual(estimate_cost(usage, book, "m", "inclusive_cache", "fixed_85")["usd"], 0.00147)
        self.assertIsNone(estimate_cost({}, book, "m", "inclusive_cache")["usd"])

    def test_delivery_and_checkpoint_agent_failures_preserve_earlier_success(self):
        targets = ["checkpoint_1", "checkpoint_2", "checkpoint_3"]
        manifest = {"schema_version": 1, "benchmark_version": "checkpoint-failures",
                    "chains": [{"id": "task", "task_type": "synthetic",
                    "checkpoints": [{"id": cp} for cp in targets]}]}
        for agent_failure in (False, True):
            passed = {"target_checkpoint": targets[0], "state": "passed",
                      "compatibility": {"score": "identical"}, "test_counts": {
                          "structure": {"passed": 1, "total": 1},
                          "core": {"passed": 2, "total": 2},
                          "regression": {"passed": 1, "total": 1}}}
            failed = {"target_checkpoint": targets[1], "state": "inference_error" if agent_failure else "failed",
                      "compatibility": {"score": "compatible"}}
            tail = {"target_checkpoint": targets[2], "state": "stopped_by_policy"}
            if agent_failure:
                failed["score_override"] = {"value": 0, "reason": "agent_failure"}
                tail.update(state="inference_error", inherited_failure=True, attempted=False,
                            score_override=failed["score_override"])
            else:
                failed["candidate_failure"] = "delivery_failure"
            cell = {"id": "pipeline", "problem": "task", "mode": "pipeline", "model": "m",
                    "agent": "codex", "formal": True, "repeat": 0, "status": "completed",
                    "outcome": "failed", "progression_policy": "structure-cases", "planned_targets": targets,
                    "expected_test_counts": {cp: {"groups": {"structure": 1, "core": 2, "regression": 1}} for cp in targets},
                    "checkpoints": [passed, failed, tail]}
            group = calculate({"cells": [cell]}, manifest, {})["groups"][0]
            rows = [r for r in group["checkpoint_records"] if r["mode"] == "pipeline"]
            self.assertEqual([r["strict_pass"] for r in rows], [1, 0, 0])
            self.assertEqual(rows[2]["execution_status"], "not_reached")
            self.assertIsNone(rows[1]["groups"])
            self.assertEqual(rows[1]["failure_group_totals"]["core"], 2)
            self.assertAlmostEqual(group["primary"]["pipeline_cc"]["value"], 1 / 3)
            self.assertEqual(group["primary"]["pipeline_fc"]["value"], 0)


if __name__ == "__main__":
    unittest.main()
