"""Portable acceptance examples from the paper, without framework dependencies."""

import unittest

from paper_metrics import calculate
from paper_metrics import estimate_cost
from paper_metrics import group_results
from paper_metrics import normalize_checkpoint


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
            self.assertEqual(regression["denominator"], regression_total)
            self.assertEqual(regression["value"], 1 if regression_total else None)
            for row in group["checkpoint_records"]:
                self.assertIsNone(row["groups"])
                self.assertEqual(row["raw_execution_status"], "inference_error")
            # Unknown group sizes remain unavailable, even for a counted failure.
            for cell in cells:
                cell.pop("expected_test_counts")
            unknown = calculate({"cells": cells}, manifest, {})["groups"][0]
            self.assertIsNone(unknown["auxiliary"]["sr_regression_failure_rate"]["value"])
            self.assertIsNone(unknown["auxiliary"]["sr_core_completion"]["value"])

    def test_cache_scenarios(self):
        book = {"version": "synthetic", "currency": "USD", "unit": "per_million_tokens",
                "rates": [{"model": "m", "input": 2, "output": 10, "cache_read": 0.2, "cache_write": 2.5}]}
        usage = {"input": 1000, "output": 100, "cache_read": 800, "cache_write": 50, "reasoning": 80}
        self.assertAlmostEqual(estimate_cost(usage, book, "m", "inclusive_cache")["usd"], 0.001585)
        self.assertAlmostEqual(estimate_cost(usage, book, "m", "inclusive_cache", "fixed_85")["usd"], 0.00147)
        self.assertIsNone(estimate_cost({}, book, "m", "inclusive_cache")["usd"])


if __name__ == "__main__":
    unittest.main()
