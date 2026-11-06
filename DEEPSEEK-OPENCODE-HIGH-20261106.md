# DeepSeek-V4.1-Flash high + OpenCode 1.18.32 — complete results

All 89 groups have final scores: 15 Pipeline and 74 SR. There are 62 passed trials and 27 evaluated nonpasses. The campaign completed at 2026-11-06 10:11 UTC (18:11 China time).

| Metric | Complete result |
| --- | ---: |
| Pipeline FDR | 26.67% (4/15) |
| Pipeline CC | 41.17% |
| Pipeline FC | 71.99% |
| SR CPR | 78.38% (58/74) |

The final `verilog_pcie_t3:pipeline` group completed with score 1/8 (0.125): checkpoint_2 passed, and checkpoint_3 through checkpoint_9 failed. Attempt `4536832e2eb94bcdbb00adf6d6c143f3` has final inference, evaluation, test records and code archives for all eight checkpoints.

The authorized infrastructure retry for `verilog_pcie_t3:sr:checkpoint_4` remains a valid evaluated nonpass: 79/86 tests passed (Structure 1/1, Core 1/8, Regression 77/77). The selected attempt is `b53dca3a4a4e475ab8a8e6022b8c9b5b`; the original infrastructure failure remains in history. There were 90 physical attempts for 89 scored groups, with the first completed valid attempt selected and no best-score selection.

Seed 42, one repeat. Structure-cases continuation and all-cases checkpoint scoring; policy-stopped checkpoints score zero. This release binds 148 fresh Docker collection inventories and all 148 planned checkpoint slots, including six policy stops, with 142 unique candidate code archives. Publication performs no new model inference or RTL evaluation. Previously published scores, selected attempts and evidence are unchanged.

The earlier [88-group partial snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=99bb5ebd0bd3846fce2bd959f4fea1524579333197b909782c567a3eaa985ea4) remains immutable; current results use this complete snapshot.

Costs use the user-provided official peak prices: CNY 0.04 / approximately USD 0.006 cached input, CNY 2.00 / approximately USD 0.30 uncached input, and CNY 8.00 / approximately USD 1.20 output per 1M tokens. Separately recorded reasoning is included in billed output. Uniform peak-rate estimates for the selected attempts are USD 8.26478 Pipeline + USD 8.99783 SR = USD 17.26261 with recorded cache usage; the uniform 85% cache scenario is USD 45.22471. These are comparison estimates before off-peak discounts, excluding the unselected infrastructure attempt; the immutable source snapshot retains its original unpriced usage. Qualified task inputs are frozen at suite `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`. Historical orchestration differs in `experiments/runner.py`; full historical framework equality is not claimed.

Published analysis: `216cd33560004d07b65a9640333c576fed5ff0267f053c5d79c07d75bf970076`. Raw analysis: `dbccb9d083eab42aeda2f6f1427f8e41ce27b8a162e347741fa312351e4f8f55`.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=deepseek-flash&thinking=high) · [Complete snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=216cd33560004d07b65a9640333c576fed5ff0267f053c5d79c07d75bf970076)
