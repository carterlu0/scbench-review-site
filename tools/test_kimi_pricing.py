"""Reconcile Kimi prices with a saved native event and official wire usage."""
import importlib.util
import json
from pathlib import Path
import unittest

from paper_metrics import estimate_cost

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('kimi_builder', ROOT / 'tools/build-paper-metrics.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class KimiPricing(unittest.TestCase):
    def setUp(self):
        overrides = json.loads((ROOT / 'data/paper/price-overrides.json').read_text())
        self.book = builder.apply_price_overrides(
            {'currency': 'USD', 'unit': 'per_million_tokens', 'rates': []},
            {'cells': [{'model': 'kimi-k3.1-pro'}]}, overrides)

    def test_native_output_reconciles_with_official_completion(self):
        # Saved 2026-11-06 03:49:16 UTC event: official prompt=8979,
        # cached=6656, completion=228, reasoning=52; native visible output=176.
        usage = {'input': 2323, 'cache_read': 6656, 'cache_write': 0,
                 'output': 176, 'reasoning': 52}
        cost = estimate_cost(usage, self.book, 'kimi-k3.1-pro', 'exclusive_cache')
        expected_cny = (2323 * 13 + 6656 * 1.3 + 228 * 68) / 1e6
        self.assertAlmostEqual(cost['usd'], expected_cny * .149565)
        self.assertEqual(cost['billed_tokens']['output'], 228)
        self.assertEqual(usage['output'], 176)
        fixed = estimate_cost(usage, self.book, 'kimi-k3.1-pro', 'exclusive_cache', 'fixed_85')
        self.assertAlmostEqual(fixed['usd'], (8979 * (.15 * 13 + .85 * 1.3) + 228 * 68) * .149565 / 1e6)

    def test_explicit_cache_write_partition_is_charged_once(self):
        # Wire cache_write=2304 is included in native uncached input=2323.
        native = {'input': 2323, 'cache_read': 6656, 'cache_write': 0,
                  'output': 176, 'reasoning': 52}
        partitioned = {**native, 'input': 19, 'cache_write': 2304}
        one = estimate_cost(native, self.book, 'kimi-k3.1-pro', 'exclusive_cache')
        two = estimate_cost(partitioned, self.book, 'kimi-k3.1-pro', 'exclusive_cache')
        self.assertAlmostEqual(one['usd'], two['usd'])

    def test_missing_reasoning_is_unknown(self):
        usage = {'input': 100, 'cache_read': 0, 'cache_write': 0, 'output': 20}
        cost = estimate_cost(usage, self.book, 'kimi-k3.1-pro', 'exclusive_cache')
        self.assertIsNone(cost['usd'])
        self.assertEqual(cost['reason'], 'missing_reasoning_usage')

    def test_published_completed_costs_have_explicit_pending_pcie(self):
        latest = json.loads((ROOT / 'data/results/latest.json').read_text())
        group = next(g for g in latest['report']['groups']
                     if g['config']['model'] == 'kimi-k3.1-pro')
        rate = next(r for r in latest['report']['price_metadata']['rates']
                    if r['model'] == 'kimi-k3.1-pro')
        self.assertEqual([rate[k] for k in ('input', 'output', 'cache_read', 'cache_write')],
                         [1.944345, 10.17042, .1944345, 1.944345])
        self.assertEqual(rate['source_prices_cny_per_million'],
                         {'input': 13, 'output': 68, 'cache_read': 1.3, 'cache_write': 13})
        self.assertEqual(rate['output_token_semantics'], 'exclusive_reasoning')
        self.assertEqual(group['resources']['sr_actual']['known_cost_records'], 74)
        self.assertEqual(group['resources']['pipeline_actual']['known_cost_records'], 66)
        self.assertAlmostEqual(group['resources']['sr_actual']['total_cost_usd'], 111.13635639 * .149565 / .15)
        self.assertAlmostEqual(group['resources']['pipeline_actual']['known_total_cost_usd'], 57.67957311 * .149565 / .15)
        self.assertIsNone(group['resources']['pipeline_actual']['total_cost_usd'])
        self.assertEqual(group['publication']['pending_trials'], 1)


if __name__ == '__main__':
    unittest.main()
