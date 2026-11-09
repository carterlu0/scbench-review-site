import unittest
import copy
import importlib.util
from pathlib import Path
from paper_metrics import calculate


class TemporaryZeroTests(unittest.TestCase):
    def test_pending_trial_zero_is_explicit_and_keeps_resources_unknown(self):
        override = {"value": 0, "reason": "temporary_user_zero", "provisional": True}
        cp = {"target_checkpoint": "checkpoint_1", "state": "pending",
              "score_override": override, "tests": [],
              "expected_test_counts": {"total": 3, "groups": {"structure": 1, "core": 2, "regression": 0}},
              "compatibility": {"score": "compatible"}}
        cell = {"id": "pending", "problem": "task", "mode": "pipeline",
                "model": "m", "agent": "opencode", "formal": True,
                "status": "running", "score": 0, "score_override": override,
                "progression_policy": "structure-cases", "planned_targets": ["checkpoint_1"],
                "expected_test_counts": {"checkpoint_1": cp["expected_test_counts"]},
                "checkpoints": [cp]}
        manifest = {"schema_version": 1, "benchmark_version": "test", "chains": [{"id": "task", "task_type": "synthetic",
                     "checkpoints": [{"id": "checkpoint_1"}]}]}
        analysis = {"cells": [cell]}
        book = {"version": "test", "rates": []}
        report = calculate(analysis, manifest, book)
        group = report["groups"][0]
        row = next(r for r in group["checkpoint_records"] if r["mode"] == "pipeline")
        self.assertEqual(row["strict_pass"], 0)
        self.assertEqual(row["reason"], "temporary_user_zero")
        self.assertIsNone(row["groups"])
        self.assertIsNone(row["costs"]["actual"]["usd"])
        self.assertIsNone(row["agent_elapsed_seconds"])
        self.assertEqual(cell["status"], "running")
        self.assertEqual(cp["tests"], [])
        spec = importlib.util.spec_from_file_location(
            "builder", Path(__file__).with_name("build-paper-metrics.py"))
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        details = {"groups": [{"id": g["id"], "checkpoint_records": g.pop("checkpoint_records")}
                              for g in report["groups"]]}
        pending_cost = copy.deepcopy(row["costs"])
        builder.reprice_report(report, details, analysis, manifest,
                               {**book, "version": "updated-prices"})
        self.assertEqual(row["costs"], pending_cost)
        self.assertEqual(group["resources"]["pipeline_actual"]["cost_missing_reasons"],
                         {"pending_experiment": 1})
        del cp["score_override"]
        del cell["score_override"]
        group = calculate({"cells": [cell]}, manifest, {"version": "test", "rates": []})["groups"][0]
        row = next(r for r in group["checkpoint_records"] if r["mode"] == "pipeline")
        self.assertIsNone(row["strict_pass"])
