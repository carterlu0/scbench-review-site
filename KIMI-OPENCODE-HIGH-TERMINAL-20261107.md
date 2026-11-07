# Kimi K3.1 Pro high + OpenCode — PCIe checkpoint 4 delivery failure

All 89 groups are finalized: 15 Pipeline and 74 SR. The final resumed PCIe Pipeline attempt is published as a terminal delivery failure at checkpoint 4, as requested. Checkpoint 1 is the supplied baseline. Checkpoint 2 keeps its 35/35 pass; checkpoint 3 keeps its 12/21 result (Core 1/5, Regression 10/15). Checkpoint 4 reached the 7200-second limit and its candidate entrypoint returned exit code 1 with checkpoint-3 build usage. It is a delivery failure, not an ordinary simulation-test failure. Checkpoints 5–9 were not reached and contribute zero without implying that tests ran.

PCIe checkpoint completion is 1/8 and its final delivery score is 0. There is no trial-wide zero override: the earlier successful checkpoint remains counted. All other 88 groups, their selected attempts, test verdicts, candidate identities and scores are preserved. The previous provisional snapshot remains available.

Pipeline FDR **20.00%**, CC **34.33%**, FC **51.83%**. SR CPR **55/74 (74.32%)**. The suite has 148 planned checkpoint slots and Docker inventories. This release references 131 code archives, including the final PCIe checkpoint 2–4 candidates. Seed 42, one repeat; Structure-cases continuation and all-cases scoring. No new inference or evaluation was started for publication.

Kimi prices remain CNY 13 input / 68 output / 1.30 cache hits / 13 cache writes (5 min) per MTok, converted at the published 2026-11-07 ExchangeRate-API reference rate of USD 0.149565/CNY. USD/MTok: 1.944345 / 10.17042 / 0.1944345 / 1.944345. OpenCode reasoning is separately recorded and billed with output. Selected results cost **$189.920649** (Pipeline $79.106588 + SR $110.814061), including PCIe checkpoint 2–4 **$21.594286**. Unselected retries are excluded; non-invoked checkpoints cost zero.

Analysis: `131c7bae9682846e2ae80e59667a09e435387950d2e16b4244d52c50391b338a`.
Raw analysis: `ed9c73095934d640667c6e63519971ab71a3640b88d9cd8374fddd6413f083d8`.
Selected resumed PCIe attempt: `d6f5eaca94ae4b79884d9f14f8ac5b90`. Its original ledger status `infra_failed`, original checkpoint-4 state `inference_error`, and later `missing` states are retained in the publication ruling and raw-state fields. The live ledger and run files were not edited.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=kimi-k3.1-pro&thinking=high) · [Final snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=131c7bae9682846e2ae80e59667a09e435387950d2e16b4244d52c50391b338a) · [Previous provisional snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=b513c7e693e929cb6207dc47fc7463f8eda326aa1d2bef2d4edbc00b3b6d4ec6)

[Machine-readable prices and checkpoint costs](https://github.com/carterlu0/scbench-rtl-problems/blob/main/experiments/PRICING-KIMI-CHECKPOINT4-20261107.json).
