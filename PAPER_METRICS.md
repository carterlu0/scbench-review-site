# EvoRTL paper metrics

The implementation follows `rtl_repo_scout/paper/EvoRTL评分指标.md`
(2026-10-26), with the user-specified FC extension (2026-10-28).
Scoring version: `evortl-paper-2026-10-28-v3`.
It reads saved results; it never calls models, executes RTL tests, edits task
definitions, or rewrites attempts and qualification evidence.

## Compute and export locally

From `/home/carter/slop-code-bench`, using the captured delivery inputs:

```bash
.venv/bin/python -m slop_code.experiments.paper_metrics \
  --analysis rtl_repo_scout/reports/paper_metrics_20261027/inputs/analysis.json \
  --manifest configs/experiments/evortl-paper-manifest-v1.json \
  --pricebook rtl_repo_scout/reports/paper_metrics_20261027/inputs/pricebook.json \
  --output /tmp/evortl-paper-metrics
```

The CLI also provides `slop-code experiments paper-score ANALYSIS --manifest
MANIFEST --pricebook PRICEBOOK --output OUTPUT`. Inputs are public analysis
JSON with full checkpoint test records, a frozen benchmark manifest and a
versioned USD-per-million-token pricebook. For an exported analysis, hydrate its
`detail_paths` first; the website builder does this with dependency-hash checks.
`protocols` maps recorded protocol IDs to their full saved protocol objects.

Outputs: `summary.json`, `summary.csv`, `chains.csv`, `checkpoints.csv`, and
`checkpoints.jsonl`. JSON retains original token usage, item IDs/statuses, source
hashes, per-group counts/applicability, configuration and repeat bindings,
missing-data reasons, both cache scenarios, and repeat means/stddevs.
Decimals remain unrounded through aggregation and efficiency calculation.

FDR is the chain mean of strict success at each manifest-defined final node.
CC averages strict checkpoint completion within each chain, then across chains.
FC (Pipeline Final Completion) is the task-chain mean of the applicable Core +
Regression pass fraction at each chain's **preset manifest-defined final
checkpoint**. If that checkpoint is not reached because of a verified terminal
progression failure, its F_j is zero. If reached, Structure must pass in full;
otherwise F_j is zero. With Structure passed, F_j=(Core passed + Regression
passed)/(Core applicable + Regression applicable). Earlier checkpoint successes
never contribute to FC. Regression with zero applicable tests adds zero to both
numerator and denominator; a missing/zero combined denominator stays unknown.
Pending, missing and infrastructure-invalid evidence stays N/A, preserving the
full chain denominator. Historical Functionality is a Core alias: its test nodes, required IDs,
counts and inventory totals are merged into Core exactly once before scoring.
It participates in FC and Core metrics; Error remains outside FC's ratio. Original compatibility and applicability checks
still apply. Exports include pipeline_fc, per-chain f_j, final checkpoint ID,
Structure status and final Core/Regression counts. FC also participates in
independent-repeat statistics, task-type groups and optional resource efficiency
using the full Pipeline cost/time per chain, including earlier failed rounds.

Current complete High FC=52.9774184% and Medium FC=34.3649249% (15 chains each).
Low/xhigh full-benchmark FC remains N/A because their task coverage is incomplete.
CPR averages independent SR checkpoint success. Structure-only progression is
required for Pipeline; Core/Regression failure can be followed by later success.
An evidenced Structure stop contributes zero for the suffix, with no fabricated
test failures or consumption. Missing, pending and invalid results retain the
manifest denominator and prevent a complete score. Formal scores additionally
require each included result's compatible/identical status; raw complete
diagnostics are separate fields. A missing legacy SR target can be resolved only
by the explicit, frozen version audit described below; unknown alone is never
treated as compatible.
An explicitly recorded `valid_execution_failure: true` makes a terminal valid-run
agent/budget exception a zero; without a Structure pass it stops the Pipeline.
Confirmed infrastructure invalidity takes precedence over that flag.

## Frozen identities and test applicability

The default analysis's SR target metadata has been audited without running any
models or evaluators. The legacy analyzer grouped all SR wrappers of a problem
under one target-version key, although each checkpoint has its own preparation.
New analyses now use `problem|sr|prompt_arm|target_checkpoint`, retaining explicit
cell overrides and legacy configuration keys. Historical analysis JSON is intact.

`sr_version_audit` in the frozen manifest supplies 74 target versions and exact
bindings for 119 selected SR records. The extractor
`rtl_repo_scout/tools/audit_paper_sr_versions.py` opens SQLite read-only, verifies
cell/preparation/evaluation object identities, checks 122 frozen preparations
(156,516 files), reconstructs inference generations including prompts and initial
state, and matches selected candidates, evaluation/inference hashes, tests,
tokens and timings against the ledger. Existing evaluator-only repairs retain
their decision-bound generation rather than using an inference hash formula.
All settings agree on the target version for each active SR and prompt arm.

At scoring time, the complete selected-evidence binding, target and verified
preparations must match the frozen audit. Only `unknown` fields on the identical
inference/evaluation/target version resolve to `identical`; explicit decisions
are preserved. Existing three reviewed SR reevaluations keep their compatible
scores/costs and incompatible timings. The report exports original and resolved
statuses, target generation and audit ID. It never writes these changes back to
attempts or published analysis. Different candidates, evaluations, versions,
prompts and unreviewed future cells cannot inherit this audit by task name alone.

The default High CPR is now formally 38/74 (51.3513514%). Its 70 legacy unknown
score flags were missing-target metadata, not missing test evidence. Incomplete
Low/Medium/xhigh full-benchmark scores and incompatible timing efficiencies
remain N/A. Audit CSV/JSON and the 74-row target table are in
`rtl_repo_scout/reports/paper_metrics_20261027/`.

`configs/experiments/evortl-paper-manifest-v1.json` freezes the existing 15-chain /
74-checkpoint paper list and existing task types and primary/secondary activities.
The scorer reads these counts; it has no benchmark-size constants. Original
PCIe `checkpoint_1` is absent; original `checkpoint_2`–`checkpoint_9` remain the
eight active target IDs. Aliases between family, pipeline and public package
names are explicit. Test groups are never inferred from file names or outcomes.

Preferred manifests supply `tests.pipeline` / `tests.sr`: predeclared test IDs,
groups and applicability per checkpoint. Existing results can also supply their
frozen evaluator collection nodes or explicit group totals; the report records
which source is available. Empty Structure/Core is invalid. Regression is N/A
only with explicit zero applicable items. Missing groups do not imply N/A.
Required skips remain unexecuted, and required absent IDs do not pass.
Functionality is never a separate formal group. Original raw evidence remains
unchanged; projected test nodes retain `source_group: Functionality` when
applicable. Dual markers on one test do not create another test. Required
failures/skips remain failures/unexecuted Core checks after this projection.

Two existing supersession rules were read from exact frozen preparations:
SERV retires the old ABI check from checkpoint 6; CLINT direct checks defer to
later checkpoints' replacement regression coverage. The manifest embeds the
source texts, their SHA-256, preparation identities and exact evaluation
generations. Only these declared nodes, at the specified targets, generation and
mode, may become N/A when the recorded status is skipped. A failure before a skip
guard remains a failure. These rules are independent of a candidate's behavior.
The extractor opens SQLite in read-only mode and does not collect new evidence.

Three published protocol IDs differ only in their batch name/version; every saved
execution parameter is byte-equivalent after canonical serialization. An explicit
manifest equivalence binds their complete execution-settings hash to a shared
configuration ID. The scorer rechecks the full hash before aggregating; a budget,
gate, timeout or other recorded-setting change prevents grouping. Original
protocol IDs and task-specific effective configuration hashes remain in the
report. Other protocols, prompts, models, agents, efforts and repeats stay apart.
Repeated trials are calculated independently; no best-of-k selection or filling
from a different repeat occurs. Ambiguous duplicate observations are invalid.

## Cost and time

Both scenarios use the same actual saved input/output totals:

- `actual`: uncached input, cache reads, cache writes and output at their fixed
  model rates. Codex input includes cache tokens; Claude/OpenCode input excludes
  them. An explicit `usage_input_semantics` overrides this adapter mapping.
- `fixed_85`: 85% of total prompt input at the cache-read rate, 15% at the input
  rate, no additional cache-write charge, and the unchanged output total. This is
  an estimate scenario, not an assertion about measured cache hits.

Reasoning is already part of output and is not added again. Missing usage, all-zero
unverified usage, inconsistent cache totals and missing applicable prices remain
null, with reasons. Rates with context tiers require per-request evidence whose
token totals reconcile exactly; aggregate usage cannot choose a tier implicitly.
Pricebook version/date/source are preserved. Current GPT-6-Luna rates are the
existing user-provided 2026-10-23 Standard rates, explicitly marked independently
unverified; they are not presented as a current provider quote or actual bill.

Costs and durations correspond to the selected valid trajectory (including failed
executed rounds). FDR/CC/FC use mean USD and seconds per chain; CPR uses mean USD and
seconds per checkpoint. Missing consumption prevents complete efficiency, without
discarding that task. Retry/invalid-attempt totals are separate, not mixed into
the selected-run denominator or lost. Cost and time compatibility are checked
independently of score compatibility when publishing efficiencies.

Default timing policy `agent_only` sums saved agent invocation elapsed seconds,
including tools/self-validation; external evaluation is recorded separately.
`--timing-policy agent_plus_evaluation` includes the saved external evaluation
segments. Scheduling wait and container preparation are excluded and not filled
as zero. Parallel batch wall time is never divided among tasks. Efficiencies use
performance divided by mean consumption, with null for zero/missing denominators.

## Website and local preview

The current 212-trial analysis includes the newly published 72-trial Medium
batch, together with its existing CLIC/SERV observations. The Medium protocol
`f71a453d…` has the same complete execution settings as the two existing batch
protocols; its explicit hash-checked equivalence prevents splitting Medium into
incomplete 13-chain and 2-chain groups. The frozen CLINT direct-test applicability
rules also include the Medium preparation's exact generation, verified against
the stored sources. Current Medium: FDR=0/15, CC=0.1411111111 and CPR=28/74.
High remains unchanged; Low/xhigh retain incomplete full-benchmark results.

FDR/CC/FC/CPR and optional auxiliary/resource tables appear only on the experiment
overview. A single problem route shows the Checkpoint evidence matrix and trial
evidence, and does not fetch the paper report. Its recorded/SR trial counts are
scoped to that problem. Back-navigation returns to the overview metrics.

Checkout: `experiment-system-workspaces/scbench-paper-metrics-20261027/`.

```bash
.venv/bin/python experiment-system-workspaces/scbench-paper-metrics-20261027/tools/build-paper-metrics.py
.venv/bin/python -m http.server 8773 --bind 127.0.0.1 \
  --directory experiment-system-workspaces/scbench-paper-metrics-20261027
```

Open `http://127.0.0.1:8773/#experiments`. FDR/CC/FC/CPR are the default table.
Auxiliary metrics and cost/time/efficiency are optional. Cache policy and task
type are shareable URL parameters. A problem search does not silently shrink the
benchmark denominator. Existing problem/checkpoint evidence remains expandable.
CSV includes primary/auxiliary/resource/efficiency rows; JSON includes full
checkpoint details. The Pages sync rebuilds the same reports from hash-checked
public evidence after each update. Old experiment releases remain unchanged.

Auxiliaries: Pipeline/SR Core Pass Rate, SR Core Completion, applicable-SR
Regression Failure Rate, Pipeline Trajectory Success, SR All-Checkpoint Success,
and SR Chain Macro. Task-type analyses use chain metadata; SR activity analyses
use exclusive primary labels. Secondary labels do not duplicate checkpoint weights.

## Validation

```bash
.venv/bin/pytest tests/experiments/test_paper_metrics.py tests/experiments/test_experiments.py -q
node --test experiment-system-workspaces/scbench-paper-metrics-20261027/tests/*.test.mjs
```

These are framework/scorer and browser checks, not problem tests. The paper's
two-chain example reproduces FDR=0.5, CC=7/12, CPR=0.8, SR chain macro=0.75,
and the specified resource-efficiency formulas. Additional cases cover early
stops, missing/invalid results, zero denominators, required skipped tests,
version-bound supersession, cache semantics and context-tier pricing.
