# MiMo v2.6 Pro / OpenCode: current formal results (2026-11-05)

This publication includes every one of the 89 planned groups (15 Pipeline + 74 Snapshot Repair), with 148 planned checkpoint slots. **84 groups have final scores; 5 remain unscored after infrastructure failures. This is the complete current evidence snapshot, not a claim that all 89 groups have final scores.**

| Group outcome | Count |
| --- | ---: |
| Passed | 37 |
| Failed evaluation or delivery checks | 28 |
| Terminal 7200-second delivery timeout, score 0 | 19 |
| Unscored infrastructure failure | 5 |

All 15 infrastructure retries completed at a maximum of 8 concurrent groups: 5 passed, 3 failed evaluation, 2 hit the terminal runtime limit, and 5 encountered infrastructure failures again. The publication preserves 104 physical attempts and classification-only timeout provenance, without selecting the best score or counting classification copies as extra resource use.

## Configuration and comparability

- Model: `mimo-v2.6-pro`, Agicto channel; OpenCode `1.18.32`.
- Harness effort label: `high`. Native MiMo thinking: `{"type":"enabled"}`. MiMo exposes enabled/disabled thinking, so this label does not establish a native high-tier equivalence with the GPT models.
- Seed 42. Frozen suite `24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`. Tests, prompts, environment, evaluator, agent budgets and progression policies are unchanged from the source Sol/OpenCode arm.
- User-confirmed policy: every 7200-second runtime timeout is a terminal delivery failure with score 0 and no infrastructure retry. All 19 such groups retain their raw states, candidates and any earlier evaluations; no missing evaluations are fabricated.
- Unresolved infrastructure groups retain null scores and the full planned denominators. Aggregate metrics with unresolved required inputs stay unknown.
- Agicto MiMo pricing has not been verified. Costs remain unknown; no GPT rate or artificial zero is substituted.

## Remaining infrastructure failures

| Task | Latest cause | Available evaluated checkpoints |
| --- | --- | --- |
| `common_cells_t1:pipeline` | The response was blocked by the provider's content filter | None |
| `mipi_dphy_t2:pipeline` | Connection reset by server | checkpoint_1, checkpoint_2 |
| `register_interface_t1:pipeline` | Connection reset by server | None |
| `taxi_axi_t3:sr:checkpoint_1` | The response was blocked by the provider's content filter | None |
| `wb2axip_t2:sr:checkpoint_2` | The response was blocked by the provider's content filter | None |

Each remaining group has already had two physical attempts. The two connection resets warrant another infrastructure retry to complete the experiment. The three provider content-filter blocks also require a valid run to obtain scores, but repeated unchanged calls may fail again; investigate Agicto filtering before retrying. Keep the benchmark questions and channel unchanged. They are not model delivery failures and must not be silently scored as zero.

## Evidence and access

- Analysis: [`a80eb40e8226de624f7eb6738e05b4a93da8aa74f47ea8e96f30d78f408677a7`](analyses/a80eb40e8226de624f7eb6738e05b4a93da8aa74f47ea8e96f30d78f408677a7.json).
- [Publication receipt](MIMO-OPENCODE-HIGH-20261105.json) records all 89 task/attempt bindings, all 19 timeout decisions, the five unresolved causes and inventory provenance.
- Per-problem records include saved test verdicts, candidate/inference/evaluation hashes, native usage/call observations and 93 immutable candidate archives (deduplicated by content). Candidate download links resolve to this repository.
- The 148 original Docker collection inventories are bound to the same exact problem and evaluation generations. Original historical publications and the previous default analysis are retained.
- [Current website view](https://carterlu0.github.io/scbench-review-site/#experiments?model=mimo-v2.6-pro&thinking=high).
- [Frozen analysis view](https://carterlu0.github.io/scbench-review-site/#experiments?analysis=a80eb40e8226de624f7eb6738e05b4a93da8aa74f47ea8e96f30d78f408677a7).
- Provider credentials, private request configuration and raw agent logs are excluded from the public export.
