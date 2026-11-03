# Frozen RTL final-suite publication — 2026-11-03

Analysis: `e5fd63bae542d4f07bc711abf1792ed6a356298138c17c8873ba377d3927472b`
Frozen suite: `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`
Freeze manifest SHA-256: `0b5a262136a7b2986df50b4052154375efafbcbbb6bffba73dd9c2b467fbe534`
Analysis file SHA-256: `6842b8733b113d608a59ca5885fc712db627f3b820bfed438520ff91411aa355`

The default analysis replaces the previous four Luna settings and Sol High with current frozen-suite checkpoint results. Historical releases remain selectable. The last outstanding Luna xhigh PCIe pipeline C9 has completed and is included.

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

This release publishes the frozen-suite result matrix and nonpass distribution. FDR/CC/FC/CPR reports and inference costs have not been recomputed for this analysis; previous paper reports remain tied to their immutable historical analyses.

Validation: 69 Node tests, 14 Python unit tests, syntax and whitespace checks, paper-catalog rebuild without reusing historical reports, analysis SHA-256 verification, and Chromium rendering of the default result page.
