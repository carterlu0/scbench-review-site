# Applicable test counts — 2026-11-05

The current results view now uses the same reviewed test applicability as the
formal scoring records. Original evaluator counts, test nodes (including skips),
execution states, candidate evidence and historical snapshots are retained.
No agent or evaluator was rerun, and no formal metric changed.

- EF UART: all seven final results display `0/9`. The older five configurations
  previously lacked the final expected inventory. All seven stopped after a
  delivery failure; the final nine tests were not executed.
- CLINT: all seven final results use denominator 9. Each collected 18 nodes,
  including nine superseded direct checks explicitly skipped at checkpoint 4.
- SERV: all seven final results use denominator 26. The collected population has
  27 nodes, including the legacy bus ABI check skipped after the switch to
  Wishbone at checkpoint 6. Stopped finals use the expected applicable count.
- Luna xhigh SERV remains passed at checkpoint 10 (`26/26`), with nine of ten
  checkpoints passed overall; the genuine CSR failure at checkpoint 6 remains.

`tools/build-latest-results.py` projects evaluated counts from the already scored
checkpoint groups. The separate `display_*` fields make this projection explicit
without replacing raw `test_counts` or inventing test results at unexecuted
checkpoints. Expected final inventories are bound to exact cells and evaluation
generations in `inputs/display-test-inventories.json`, with hashed Docker
collection evidence and verified frozen definition generations.
