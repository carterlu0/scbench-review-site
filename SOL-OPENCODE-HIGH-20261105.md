# gpt-6.1-sol · high+OpenCode

OpenCode 1.18.32, high reasoning effort, seed 42, frozen repaired suite
`24175ba4016301e8abe61abf31f7d63327657325850cbfb5180a6df1c23843d6`.

The initial publication contains 88 scored trials out of 89 planned trials:
86 evaluated results and two delivery timeouts scored zero under the confirmed
7200-second limit. PCIe Pipeline is awaiting its checkpoint_9 evaluation and
remains unscored. It will be added when evaluation finishes. SR has 58 strict
passes out of 74. Pipeline has 14 of 15 resolved trials; complete Pipeline
aggregates remain unavailable until the final result is resolved.

The 7200-second failures are Taxi AXI T3 Pipeline and AXIS FIFO T1 Pipeline.
Their raw inference-error states, duration, candidate identity and absence of
an evaluation are retained. The zero is an explicit delivery ruling, not an
invented simulation result. Local testing still showed progress near the limit.

The selected 78 original completed trials are preserved; completed authorized
infrastructure retries replace their interrupted original attempts. The two
timeout retries receive zero irrespective of local test progress. There is no
best-score selection. Pricing follows the existing user-provided Standard
rates and OpenCode's exclusive-cache token semantics. Original pricebook and
usage evidence remain available.

The current machine-readable publication receipt is
`data/experiments/SOL-OPENCODE-HIGH-20261105.json`. It identifies the immutable
analysis, source and retry bindings, pending trial, scoring rulings and frozen
manifest. Candidate archives and hash-checked detailed records are published
in the source repository's `experiments/` tree. Prior Codex results retain
their existing identities and are displayed as a separate configuration.
