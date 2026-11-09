# GLM-5.3 official / OpenCode high — 2026-11-09

All 89 groups completed: 15 Pipeline and 74 SR, official BigModel `glm-5.3`, high effort, OpenCode 1.18.32. Seed 42, one repeat; frozen suite `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`.

| Metric | Result |
|---|---:|
| Pipeline final delivery rate (FDR) | 1/15 (6.67%) |
| Pipeline checkpoint completion (CC) | 8.00% |
| Pipeline functional correctness (FC) | 11.06% |
| SR checkpoint pass rate (CPR) | 31/74 (41.89%) |

The separate per-problem macro-average SR score is 48.72%; CPR weights all 74 checkpoints equally. All original scores, selected attempts and test verdicts are preserved. The publication includes 148 Docker collection inventories and 89 unique downloadable candidate archives.

User-supplied USD prices per 1M tokens: input **$1.40**, output **$4.40**, cached input **$0.26**. OpenCode records uncached input, cached input, visible output and reasoning separately. Billed output is visible output plus reasoning; cached input is charged once at its own rate. Recorded cache-write usage is zero, and no separate write price is assumed.

Selected completed checkpoint inference costs **$184.83115316**: Pipeline **$43.82818576**, SR **$141.00296740**. Historical incomplete infrastructure attempts and preflight probes are excluded from this comparable result total. The uniform 85% cache scenario is shown separately on the website. Recorded usage is an estimate basis, not an account invoice.

After recharge, all 928 observed responses were HTTP 200 with response model `glm-5.3`, and all streams completed without reported server errors. Previous infrastructure failures remain in the history and have no unscored final groups.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=glm-5.3&thinking=high) · [Independent snapshot](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=4b0fc7d8e8bb49c2dd8457dff7b4b2e600708a852f9ea9e94c4076792ae65ac6) · [Pricing and checkpoint costs](https://github.com/carterlu0/scbench-rtl-problems/blob/main/experiments/PRICING-GLM-5.3-20261109.json)
