"""Request-tier billing checks for the user-provided Sol Standard prices."""
import importlib.util
import json
from pathlib import Path
import unittest

from paper_metrics import checkpoint_cost, estimate_cost, normalize_checkpoint

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "tools/build-paper-metrics.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SolPricing(unittest.TestCase):
    def setUp(self):
        self.override = json.loads((ROOT / "data/paper/price-overrides.json").read_text())
        self.base = {"version": "frozen", "currency": "USD", "unit": "per_million_tokens",
                     "rates": [{"model": "other", "input": 1, "output": 1}]}
        self.book = builder.apply_price_overrides(
            self.base, {"cells": [{"model": "gpt-6.1-sol"}]}, self.override)

    def price(self, prompt, read=100000, write=0, policy="actual"):
        return estimate_cost({"input": prompt, "cache_read": read, "cache_write": write,
                              "output": 1000, "reasoning": 800}, self.book,
                             "gpt-6.1-sol", "inclusive_cache", policy, per_request=True)

    def test_threshold_and_entire_request(self):
        self.assertAlmostEqual(self.price(272000)["usd"], 0.364)
        self.assertAlmostEqual(self.price(272001)["usd"], 0.723004)
        self.assertEqual(self.price(272001)["rate"]["output"], 15)

    def test_cache_writes_and_fixed85(self):
        self.assertAlmostEqual(self.price(300000, 200000, 50000)["usd"], 0.505)
        self.assertAlmostEqual(self.price(300000, policy="fixed_85")["usd"], 0.246)

    def test_aggregate_does_not_choose_tier(self):
        cp = {"tokens": {"input": 400000, "output": 2000, "cache_read": 200000, "cache_write": 0}}
        result = checkpoint_cost(cp, {"agent": "codex", "model": "gpt-6.1-sol"}, self.book, "actual")
        self.assertIsNone(result["usd"])
        self.assertEqual(result["reason"], "request_context_required")
        cp["calls"] = {"responses": [
            {"usage": {"input": 200000, "output": 1000, "cache_read": 100000, "cache_write": 0}}
            for _ in range(2)]}
        self.assertAlmostEqual(checkpoint_cost(cp, {"agent": "codex", "model": "gpt-6.1-sol"}, self.book, "actual")["usd"], 0.44)

    def test_incomplete_requests_remain_unknown(self):
        cp = {"tokens": {"input": 400000, "output": 2000, "cache_read": 200000, "cache_write": 0},
              "calls": {"responses": [{"usage": {"input": 200000, "output": 1000, "cache_read": 100000, "cache_write": 0}}]}}
        self.assertIsNone(checkpoint_cost(cp, {"agent": "codex", "model": "gpt-6.1-sol"}, self.book, "actual")["usd"])

    def test_override_preserves_source_and_other_models(self):
        self.assertEqual(len(self.base["rates"]), 1)
        self.assertEqual(self.book["rates"][0], self.base["rates"][0])
        self.assertIn("source_pricebook_sha256", self.book)
        self.assertIs(builder.apply_price_overrides(self.base, {"cells": [{"model": "other"}]}, self.override), self.base)

    def test_declared_bound_prices_aggregate_only_in_scoped_protocol(self):
        protocol = self.override["aggregate_request_bounds"][0]["protocols"][0]
        cell = {"agent": "codex", "model": "gpt-6.1-sol", "protocol": protocol}
        cp = {"tokens": {"input": 400000, "output": 2000, "cache_read": 200000, "cache_write": 0}}
        cost = checkpoint_cost(cp, cell, self.book, "actual")
        self.assertAlmostEqual(cost["usd"], 0.44)
        self.assertEqual(cost["context_tier_basis"], "user_declared_request_bound")
        self.assertAlmostEqual(checkpoint_cost(cp, cell, self.book, "fixed_85")["usd"], 0.174)
        cell["protocol"] = "unapproved"
        self.assertIsNone(checkpoint_cost(cp, cell, self.book, "actual")["usd"])
        self.assertIsNone(estimate_cost(cp["tokens"], self.book, "gpt-6.1-sol", "inclusive_cache",
                                       request_input_upper_bound=300000)["usd"])

    def test_observed_requests_override_declared_bound(self):
        protocol = self.override["aggregate_request_bounds"][0]["protocols"][0]
        usage = {"input": 400000, "output": 2000, "cache_read": 200000, "cache_write": 0}
        cp = {"tokens": usage, "calls": {"responses": [{"usage": usage}]}}
        cell = {"agent": "codex", "model": "gpt-6.1-sol", "protocol": protocol}
        cost = checkpoint_cost(cp, cell, self.book, "actual")
        self.assertAlmostEqual(cost["usd"], 0.87)
        self.assertEqual(cost["source"], "reconciled_native_requests")

    def test_only_listed_failed_runs_get_temporary_zero_cost(self):
        policy = self.book["temporary_failure_cost_policy"]
        cell = {"id": policy["cell_ids"][0], "model": "gpt-6.1-sol", "agent": "codex",
                "status": "completed", "outcome": "agent_failure",
                "protocol": self.override["aggregate_request_bounds"][0]["protocols"][0],
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
        first["state"] = "passed"
        unknown = normalize_checkpoint(cell, second, chain, chain["checkpoints"][1], "pipeline", self.book)
        self.assertIsNone(unknown["agent_elapsed_seconds"])


if __name__ == "__main__":
    unittest.main()
