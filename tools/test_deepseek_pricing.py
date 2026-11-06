"""Check DeepSeek peak estimates against provider/native token semantics."""
import importlib.util
import json
from pathlib import Path
import unittest

from paper_metrics import checkpoint_cost, estimate_cost

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("deepseek_builder", ROOT / "tools/build-paper-metrics.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DeepSeekPricing(unittest.TestCase):
    def setUp(self):
        override = json.loads((ROOT / "data/paper/price-overrides.json").read_text())
        self.book = builder.apply_price_overrides(
            {"version": "original", "currency": "USD", "unit": "per_million_tokens", "rates": []},
            {"cells": [{"model": "deepseek-flash"}]}, override,
        )

    def test_peak_prices_bill_both_visible_output_and_reasoning(self):
        # Actual checkpoint_9 native event, matched to provider completion=139.
        usage = {"input": 8985, "cache_read": 8448, "cache_write": 0,
                 "output": 126, "reasoning": 13}
        cost = estimate_cost(usage, self.book, "deepseek-flash", "exclusive_cache")
        self.assertEqual(cost["billed_tokens"]["output"], 139)
        self.assertAlmostEqual(cost["usd"], (8985 * .30 + 8448 * .006 + 139 * 1.20) / 1e6)
        self.assertEqual(usage["output"], 126)
        fixed = estimate_cost(usage, self.book, "deepseek-flash", "exclusive_cache", "fixed_85")
        self.assertAlmostEqual(fixed["usd"], ((8985 + 8448) * (.15 * .30 + .85 * .006) + 139 * 1.20) / 1e6)

    def test_incomplete_request_telemetry_falls_back_to_complete_aggregate(self):
        usage = {"input": 8985, "cache_read": 8448, "cache_write": 0,
                 "output": 126, "reasoning": 13}
        request = {k: v for k, v in usage.items() if k != "reasoning"}
        cp = {"tokens": usage, "calls": {"responses": [{"usage": request}]}}
        result = checkpoint_cost(cp, {"model": "deepseek-flash", "agent": "opencode"}, self.book, "actual")
        self.assertEqual(result["billed_tokens"]["output"], 139)
        self.assertIsNone(estimate_cost(request, self.book, "deepseek-flash", "exclusive_cache")["usd"])

    def test_existing_models_keep_inclusive_output_semantics(self):
        book = {**self.book, "rates": [{"model": "other", "input": 1, "output": 2, "cache_read": 0, "cache_write": 0}]}
        cost = estimate_cost({"input": 100, "output": 20, "reasoning": 15, "cache_read": 0, "cache_write": 0}, book, "other", "exclusive_cache")
        self.assertEqual(cost["billed_tokens"]["output"], 20)
        self.assertAlmostEqual(cost["usd"], 140 / 1e6)


if __name__ == "__main__":
    unittest.main()
