"""Coverage for the user-provided GPT-6.1 Standard price overrides."""
import importlib.util
import json
from pathlib import Path
import unittest

from paper_metrics import checkpoint_cost, estimate_cost, normalize_checkpoint

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "tools/build-paper-metrics.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class StandardPricing(unittest.TestCase):
    def setUp(self):
        self.override = json.loads((ROOT / "data/paper/price-overrides.json").read_text())
        self.book = builder.apply_price_overrides(
            {"version": "frozen", "currency": "USD", "unit": "per_million_tokens",
             "rates": [{"model": "other", "input": 9, "output": 9}]},
            {"cells": [{"model": "gpt-6.1-sol"}, {"model": "gpt-6.1-terra"}]},
            self.override,
        )

    def test_fixed_standard_rates(self):
        rates = {rate["model"]: rate for rate in self.book["rates"]}
        self.assertEqual((rates["gpt-6.1-sol"]["input"], rates["gpt-6.1-sol"]["output"],
                          rates["gpt-6.1-sol"]["cache_read"], rates["gpt-6.1-sol"]["cache_write"]),
                         (2, 10, 0.1, 2.5))
        self.assertEqual((rates["gpt-6.1-terra"]["input"], rates["gpt-6.1-terra"]["output"],
                          rates["gpt-6.1-terra"]["cache_read"], rates["gpt-6.1-terra"]["cache_write"]),
                         (1, 5, 0.05, 1.25))
        self.assertEqual(self.book["aggregate_request_bounds"], [])

    def test_actual_and_fixed_cache_costs(self):
        usage = {"input": 300_000, "output": 1_000, "cache_read": 200_000, "cache_write": 50_000}
        sol = estimate_cost(usage, self.book, "gpt-6.1-sol", "inclusive_cache", "actual")
        terra = estimate_cost(usage, self.book, "gpt-6.1-terra", "inclusive_cache", "actual")
        self.assertAlmostEqual(sol["usd"], 0.255)
        self.assertAlmostEqual(terra["usd"], 0.1275)
        self.assertAlmostEqual(estimate_cost(usage, self.book, "gpt-6.1-sol", "inclusive_cache", "fixed_85")["usd"], 0.1255)

    def test_checkpoint_cost_uses_standard_rates(self):
        cp = {"tokens": {"input": 400_000, "output": 2_000, "cache_read": 200_000, "cache_write": 0}}
        cell = {"agent": "codex", "model": "gpt-6.1-terra", "protocol": "unscoped"}
        result = checkpoint_cost(cp, cell, self.book, "actual")
        self.assertAlmostEqual(result["usd"], 0.22)
        self.assertEqual(result["rate"]["input"], 1)

    def test_missing_usage_stays_unknown(self):
        self.assertIsNone(estimate_cost({}, self.book, "gpt-6.1-terra", "inclusive_cache")["usd"])


    def test_only_listed_failed_runs_get_temporary_zero_cost(self):
        policy = self.book["temporary_failure_cost_policy"]
        cell = {"id": policy["cell_ids"][0], "model": "gpt-6.1-sol", "agent": "codex",
                "status": "completed", "outcome": "agent_failure",
                "protocol": "unscoped",
                "score_override": {"value": 0, "reason": "agent_failure", "provisional": True}}
        cp = {"state": "inference_error", "compatibility": {"score": "identical"}}
        chain = {"id": "task", "checkpoints": [{"id": "checkpoint_1"}]}
        row = normalize_checkpoint(cell, cp, chain, chain["checkpoints"][0], "pipeline", self.book)
        self.assertEqual(row["costs"]["actual"]["usd"], 0)
        self.assertTrue(row["costs"]["actual"]["imputed"])
        self.assertIsNone(row["costs"]["actual"]["original_cost"]["usd"])
        self.assertIsNone(row["agent_elapsed_seconds"])
        self.assertEqual(row["raw_execution_status"], "inference_error")
        cp["tokens"] = {"input": 1000, "output": 100, "cache_read": 0, "cache_write": 0}
        row = normalize_checkpoint(cell, cp, chain, chain["checkpoints"][0], "pipeline", self.book)
        self.assertEqual(row["costs"]["actual"]["usd"], 0)
        self.assertAlmostEqual(row["costs"]["actual"]["original_cost"]["usd"], 0.003)
        cp.pop("tokens")
        cell["id"] = "unapproved-failure"
        row = normalize_checkpoint(cell, cp, chain, chain["checkpoints"][0], "pipeline", self.book)
        self.assertIsNone(row["costs"]["actual"]["usd"])

    def test_failure_score_override_retains_real_time_and_proves_uninvoked_tail(self):
        cell = {"id": "failure", "model": "gpt-6.1-sol", "agent": "codex",
                "status": "completed", "outcome": "agent_failure",
                "score_override": {"value": 0, "reason": "agent_failure", "provisional": True}}
        first = {"target_checkpoint": "checkpoint_1", "state": "inference_error",
                 "inference_seconds": 123.5, "evaluation_seconds": None,
                 "compatibility": {"score": "identical", "time": "identical"}}
        second = {"target_checkpoint": "checkpoint_2", "state": "missing",
                  "compatibility": {"score": "identical", "time": "identical"}}
        chain = {"id": "task", "checkpoints": [{"id": "checkpoint_1"}, {"id": "checkpoint_2"}]}
        cell["checkpoints"] = [first, second]
        row = normalize_checkpoint(cell, first, chain, chain["checkpoints"][0], "pipeline", self.book)
        self.assertEqual(row["strict_pass"], 0)
        self.assertEqual(row["agent_elapsed_seconds"], 123.5)
        self.assertTrue(row["time_compatible"])
        tail = normalize_checkpoint(cell, second, chain, chain["checkpoints"][1], "pipeline", self.book)
        self.assertEqual(tail["agent_elapsed_seconds"], 0)
        self.assertEqual(tail["timing_source"], "not_invoked_after_recorded_failure")
        self.assertIsNone(tail["raw_agent_elapsed_seconds"])
        second["inference_seconds"] = 5
        measured = normalize_checkpoint(cell, second, chain, chain["checkpoints"][1], "pipeline", self.book)
        self.assertEqual(measured["agent_elapsed_seconds"], 5)
        second.pop("inference_seconds")
        second["calls"] = {"native_events": 3}
        ambiguous = normalize_checkpoint(cell, second, chain, chain["checkpoints"][1], "pipeline", self.book)
        self.assertIsNone(ambiguous["agent_elapsed_seconds"])
        second.pop("calls")
        first["state"] = "passed"
        unknown = normalize_checkpoint(cell, second, chain, chain["checkpoints"][1], "pipeline", self.book)
        self.assertIsNone(unknown["agent_elapsed_seconds"])


if __name__ == "__main__":
    unittest.main()
