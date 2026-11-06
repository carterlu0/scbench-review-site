# DeepSeek-V4.1-Flash high + OpenCode 1.18.32 — partial results

This immutable snapshot publishes 88 completed groups: 14 Pipeline and all 74 SR groups. There are 62 passed trials and 26 evaluated nonpasses. The full plan contains 15 Pipeline + 74 SR = 89 groups.

`verilog_pcie_t3:pipeline` is still running. Its eight planned checkpoints are explicitly unscored placeholders. No live candidate or temporary evaluation from this group is published; no unfinished result is converted to zero. Full planned denominators remain visible, and complete Pipeline aggregate scores remain unknown until this group finishes.

The authorized infrastructure retry for `verilog_pcie_t3:sr:checkpoint_4` completed with a valid nonpass: 79/86 tests passed (Structure 1/1, Core 1/8, Regression 77/77). The selected attempt is `b53dca3a4a4e475ab8a8e6022b8c9b5b`; the original infrastructure failure remains in ledger history. Selection follows the first valid completed attempt.

Seed 42, one repeat. Structure-cases continuation and all-cases checkpoint scoring; policy-stopped checkpoints score zero. This release includes 148 fresh Docker collection inventories, 140 completed checkpoint slots, detailed test records and 134 unique candidate code archives. Publishing performs no new model inference or RTL evaluation.

DeepSeek time-dependent pricing is pending. Unknown cost fields do not indicate free usage. The qualified task inputs are frozen at suite `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`; historical orchestration differs in `experiments/runner.py`, so full historical framework equality is not claimed.

Published analysis: `99bb5ebd0bd3846fce2bd959f4fea1524579333197b909782c567a3eaa985ea4`. Raw analysis: `9a9f355d5da5b75cb0aeb4eca090b3584c1e1547643d65c8bb96a0edd119554e`. Completed scores, selected attempts, candidates, inference and evaluation identities are unchanged.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=deepseek-flash&thinking=high) · [Independent snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=99bb5ebd0bd3846fce2bd959f4fea1524579333197b909782c567a3eaa985ea4)
