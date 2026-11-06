# GPT-6-Luna high + OpenCode 1.18.32

All 89 formal groups are complete: 15 Pipeline and 74 SR. Seed 42, one repeat; Structure-cases continuation and all-cases checkpoint scoring. Policy-stopped checkpoints score zero.

| Website metric | Result |
|---|---:|
| pipeline_fdr | 6.67% |
| pipeline_cc | 26.00% |
| pipeline_fc | 46.96% |
| sr_cpr | 55.41% |

The experiment has 42 passed trials and 47 evaluated nonpasses. Pipeline checkpoint states: 21 passed, 45 failed, 8 policy stops. SR: 41/74 passed (55.41% checkpoint average; 53.44% project macro average). Only clic_t2 passes its entire Pipeline. The ef_uart_t1 Pipeline misses build_checkpoint.sh at CP1; CP2–6 stop under the continuation policy.

Execution finished on 2026-11-06 at 07:46:34 Asia/Shanghai after 19 hours 13 minutes. All 89 tasks have valid terminal scores and exactly one physical attempt; no tasks remain pending.

Publication includes 148 fresh Docker checkpoint collection inventories, full checkpoint test records, 140 candidate bindings and 139 unique downloadable code archives. Model and effort request audit matches gpt-6-luna/high for all 5,144 requests, including two smoke requests. Transient transport errors do not leave any unscored groups.

The qualified scoring and agent runtime trees match the frozen preparations. experiments/runner.py orchestration differs from the historical framework freeze; full historical framework equality is not claimed.

Existing user-provided Standard prices give $2.14104668 Pipeline + $2.74250316 SR = $4.88354984; this is an estimate from saved usage, not a vendor invoice. With one independent repeat, no confidence interval is reported.

Published analysis: `80f8c52b020c0e3a81073fd02300a9a141e43f15b34ce94229ed9a854615c0e0`. Raw analysis: `e930ba04e906c9337bb6fdff276a2cd36a711fcc9c36af101874100944986152`. Raw scores, attempts, candidates and evaluations are unchanged.

[Current results](https://carterlu0.github.io/scbench-review-site/#experiments?model=gpt-6-luna&thinking=high) · [Independent release](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=80f8c52b020c0e3a81073fd02300a9a141e43f15b34ce94229ed9a854615c0e0)
