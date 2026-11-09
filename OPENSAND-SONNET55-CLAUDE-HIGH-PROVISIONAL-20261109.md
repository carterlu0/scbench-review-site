# OpenSand Claude Sonnet 5.5 high + Claude Code — 88 completed, PCIe temporarily zero

This snapshot publishes 88 completed groups (14 Pipeline and 74 SR), including 26 passing and 62 nonpassing groups. The remaining `verilog_pcie_t3:pipeline` experiment continues running. At the user's request its score and all eight planned checkpoint scores are temporarily 0. Actual test results remain pending; this provisional publication score is not a test failure verdict.

The planned denominator stays 15 Pipeline + 74 SR = 89 groups, covering 148 checkpoint slots. All 88 completed scores, selected attempts, tests, candidate identities and evaluation hashes are preserved. The release includes 128 code archives and 148 Docker collection inventories. No live PCIe candidate, incomplete evaluation, cost or timing is included in this snapshot.

Model: `claude-sonnet-5-5`, OpenSand channel, Claude Code 2.1.295, high effort. First valid completed attempt selection; seed 42, one repeat; Structure-cases continuation and all-cases checkpoint scoring. Frozen suite: `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`. Costs follow the frozen pricebook; unavailable prices and unfinished resources remain unknown.

With the provisional PCIe zero, Pipeline FDR is 0.00%, CC 9.50%, FC 30.53%. SR CPR is 26/74 (35.14%).

Analysis: `110bbf292befc9e27152e0a711a4635421fb97ea298464a17ca7be57602d7169`. The raw experiment ledger remains unchanged. This immutable snapshot will remain available after PCIe finishes and a final result is published.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=claude-sonnet-5-5&thinking=high) · [Independent snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=110bbf292befc9e27152e0a711a4635421fb97ea298464a17ca7be57602d7169)

Sonnet 5.5 prices confirmed by the user on 2026-11-09 (USD per 1M tokens): input $2.00, output $10.00, cache reads $0.10, 5-minute cache writes $2.50. The selected completed results total $93.331584 ($37.875683 Pipeline + $55.455901 SR); unfinished PCIe usage and unselected retry/recovery attempts are excluded. The historical frozen pricebook used the same numeric rates.

[Pricing details and checkpoint estimates](https://github.com/carterlu0/scbench-rtl-problems/blob/main/experiments/PRICING-SONNET55-20261109.json).
