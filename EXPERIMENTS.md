# Experiment matrix

The default view now shows the paper's **FDR, CC and CPR** from a frozen task
manifest. Auxiliary metrics and cost/time/efficiency are optional controls, with
actual-cache and uniform-85%-cache scenarios. Details, reproducible local commands,
eligibility and missing-data rules are in [PAPER_METRICS.md](PAPER_METRICS.md).
The same standard-library Python scorer builds local and Pages reports; the
scheduled source sync rebuilds derived reports after verifying source hashes.
The following describes the expandable **detailed evidence matrix** retained
below the primary score table.

Open `#experiments`. The main matrix contains pipeline results only. Every problem
name links to its own matrix, including problems with only SR observations.
Columns identify model, agent, version, effective configuration, thinking settings
and protocol; channels are not displayed.

Main results use **structure-cases** progression and show the **final checkpoint’s
passed / total tests**, including every test group. A verified stop at an earlier
Structure gate displays **0 / final total**. An unknown policy, a different gate,
an infrastructure failure or an unavailable evaluation remains unscored. The final
denominator must be explicitly recorded or come from a pipeline evaluation of the
same problem, generation, evaluation generation and final checkpoint. It is never
borrowed from a different revision or an SR wrapper. Missing denominators display
`0/?`, with the missing coverage labelled.

Click a problem to open its matrix. Rows alternate `pipeline c1`, `sr1`,
`pipeline c2`, `sr2`, and continue through all planned targets. Each recorded result
shows **Core passed / total** and **Regression passed / total** separately.
`0/0` means that group has no tests; `—` means the result is unavailable. Only the latest experiment for each configuration is displayed, ordered by its
start time (completion time if no start is available). This selection includes the
latest failures and input revisions; it does not pick the best score. Every
pipeline checkpoint comes from that same selected run, without filling gaps from
older runs. Each SR target is selected independently. Agent settings, versions,
protocols, prompt arms and experiment modes remain distinct. Timestamp ties use
completion time and then a deterministic record-ID order. Historical records and
immutable analysis statistics are preserved. Click a result to inspect exact test nodes,
failed requirements, candidate archives, defect annotations, times, costs and
observable call counts. Test evidence loads on demand.

Filters, problem, trial and checkpoint selection are represented in the URL.
Problem filters preserve the selected problem; the back link returns to the main
matrix. Both CSV and JSON export only the currently selected latest records. Older trial
bookmarks redirect to the selected latest trial in the same configuration.
CSV exports include final-checkpoint counts and their interpretation and
escape spreadsheet formula prefixes. JSON retains all selected checkpoint data.

Source: `scbench-rtl-problems/experiments/catalog.json`. `sync-experiments.mjs`
verifies every dependency hash before replacing the public manifest. Existing sync
pins the source commit for both problems and experiments. Historical analyses
predating group totals are joined to the uniquely matching published run URL and
candidate hash in `data/problems.json`. Recorded `publication_provenance.actual_pass_policy`
takes precedence over a missing top-level policy; names and filenames never imply
a progression policy. Existing immutable releases are not rewritten.

The initial dataset contains 117 historical observations for 13 problems. Only one
pipeline currently has an explicitly recorded structure-cases policy (SERV).
Other main cells report unknown policy rather than converting older Core-gated
runs into structure-gated results. All recorded Core/Regression results remain
available in each problem matrix. Historical observations remain diagnostic and
are excluded from formal comparable scores. Annotation and pricebook changes
create a new analysis release.

Validation: `node --test tests/*.test.mjs`. Browser checks cover desktop, 390px
mobile, dark/light themes, problem links, interleaved checkpoint rows, exact SERV
counts, URL reload, filtering, CSV, trial evidence, back navigation and existing
problem pages. Browser checks make no model API calls. The separate bounded
integration canary remains diagnostic; model access previously encountered
channel interruptions and incomplete native usage.
