# Frozen RTL final-suite publication — 2026-11-03

Analysis: `e5fd63bae542d4f07bc711abf1792ed6a356298138c17c8873ba377d3927472b`
Frozen suite: `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`
Freeze manifest SHA-256: `0b5a262136a7b2986df50b4052154375efafbcbbb6bffba73dd9c2b467fbe534`
Analysis file SHA-256: `6842b8733b113d608a59ca5885fc712db627f3b820bfed438520ff91411aa355`

The default Results page presents one current row per model and reasoning effort, without an analysis selector. The four Luna settings and Sol High use the completed frozen suite, including the last Luna xhigh PCIe pipeline C9. Terra High retains its latest complete result. Historical releases remain in a secondary archive.

| Setting | Planned slots | Passed | Nonpass | Policy stop | Pending |
|---|---:|---:|---:|---:|---:|
| gpt-6-luna/high | 148 | 62 | 79 | 7 | 0 |
| gpt-6-luna/low | 148 | 34 | 91 | 23 | 0 |
| gpt-6-luna/medium | 148 | 50 | 80 | 18 | 0 |
| gpt-6-luna/xhigh | 148 | 78 | 61 | 9 | 0 |
| gpt-6.1-sol/high | 148 | 99 | 45 | 4 | 0 |

The release contains 445 trial cells and 740 planned slots: 323 passed, 356 selected nonpass outcomes, 61 policy stops, and no pending slots. There are 674 selected official evaluations, two preserved native agent-failure zeros, and three explicitly authorized inherited agent-failure zeros. The latter five outcomes are included in the nonpass distribution; no simulation is fabricated for them.

Every selected nonpass appears once in both the chart and its full detail table: 302 implementation errors, 36 interface mismatches, 12 build errors, one missing implementation, and five agent failures. Three nonselected retry failures are retained separately without increasing the slot denominator.

Each policy stop references the exact earlier checkpoint, selected attempt, and native evaluation digest in the same pipeline. Fifteen stops follow a false Structure gate; 46 follow a required-delivery failure. Stops contain no claimed test execution. EF UART pipeline checkpoints 3–6 were not reached by any setting, so their unobserved collection counts remain unknown rather than inheriting old counts.

FDR/CC/FC/CPR and auxiliary metrics have now been recomputed for the five frozen-suite groups. No old Luna or Sol score is copied from analysis `52848051`; only that report's Terra metrics are reused, after checking all 89 trial bindings and selected candidate, inference and evaluation hashes. Per-task checkpoint evidence is loaded on demand.

| Setting | FDR | CC | FC | SR CPR |
|---|---:|---:|---:|---:|
| Luna low | 6.67% | 21.06% | 30.00% | 25.68% |
| Luna medium | 13.33% | 23.83% | 31.41% | 41.89% |
| Luna high | 20.00% | 27.17% | 62.12% | 54.05% |
| Luna xhigh | 33.33% | 34.00% | 75.59% | 63.51% |
| Sol high | 33.33% | 56.33% | 66.21% | 77.03% |
| Terra high | 26.67% | 45.83% | 61.11% | 75.68% |

The default table also exposes auxiliary metrics, costs, agent times and efficiencies. Usage/time inputs are recovered only from hash-matched native inference evidence. Original request-tier pricing assumptions are reused only for the same inference identity; missing prices or request context remain N/A. No agent or RTL measurement is rerun for this display change.

The current view covers six settings, 534 trials and 888 planned slots, with 404 selected nonpass outcomes and no pending slots. The failure chart, all 404 failure rows, three nonselected retry failures and historical snapshots are secondary expandable sections. Terra's observable test failures retain their recorded evidence without inventing a specific defect diagnosis.

Rebuild: `python3 tools/build-latest-results.py`. The explicit current-group registry is `data/results/current-groups.json`; generation verifies source hashes and rejects ambiguous/incomplete scoring. Scheduled synchronization rebuilds this view deterministically. Historical analyses and paper reports remain immutable.

Validation: 72 Node tests, 16 Python tests, syntax and whitespace checks; source/detail SHA-256 and selected-evidence identity checks; Chromium at 1440×1080 and 390×844; model/effort filtering, cost and threshold controls, task-type selection, CSV download, all 404 failure rows, 30 detail routes across all 15 tasks, and the historical table. No browser console errors.
