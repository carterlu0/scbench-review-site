const REPO_ROOT = "https://github.com/carterlu0/scbench-rtl-problems";

const FALLBACK_PROBLEMS = [
  {
    number: "01",
    id: "common-cells-t1",
    title: "Common Cells",
    type: "T1",
    family: "common_cells",
    tags: "rtl / verilog / common-cells",
    checkpoints: 3,
    summary: "Cumulative common_cells RTL evolution from v1.24.0 to v1.38.0, covering new modules, protocol behavior, and credit/queue logic.",
    prompt: "checkpoint_3: Add v1.37-v1.38 common_cells functionality\n\nYou are given a writable baseline RTL repository in repo/. Your task is to implement the public behavior for this checkpoint while preserving prior behavior.\n\nPublic Goal\n\nBring the repository from v1.33.0 to the complete v1.38.0 public functionality surface while preserving all earlier checkpoint behavior. This is an incremental extension plus behavior-fix checkpoint, not a request to reconstruct a final snapshot byte-for-byte.\n\nCandidate Modules\ncredit_counter\n\nEntrypoint Contract\n\nCreate or update %%%ENTRYPOINT:entry_file%%% so it can be run from the workspace root as:\n\n%%%ENTRYPOINT:entry_command%%% checkpoint_3\n\nRequired Repository Behavior\n\nstream_join_dynamic must handshake only selected inputs; unselected inputs must never receive inp_ready_o on an output handshake.\nmem_to_banks_detailed must not emit a spurious response after a full dead write and must retain its user payload association.\nThe public FFARNC macro must give synchronous clear priority over the ordinary D assignment.\nid_queue must expose NUM_CMP_PORTS and packed-array exists compare ports so independent compare requests can run in parallel.\ndelta_counter must preserve active-low reset, load, clear, up/down delta count, and sticky overflow behavior.\n\n[Excerpt. Open the source prompt for the complete contract.]",
    certDate: "2026-07-19",
    certSummary: "Passed. The current pipeline and three regenerated SR wrappers passed their evaluator definitions; 18 nodes were recorded with infrastructure_failure=false, and the same-day isolation audit covered 16 problem/snapshot combinations with 0 failures.",
    readmePath: `${REPO_ROOT}/blob/main/problems/common-cells-t1/README.md`,
    certPath: `${REPO_ROOT}/blob/main/problems/common-cells-t1/evidence/certification.md`,
    promptPath: `${REPO_ROOT}/blob/main/problems/common-cells-t1/pipeline/checkpoint_3.md`,
    checkpointLinks: [1, 2, 3].map((n) => [`checkpoint_${n}`, `${REPO_ROOT}/blob/main/problems/common-cells-t1/pipeline/checkpoint_${n}.md`])
  },
  {
    number: "02",
    id: "verilog-axis-fifo-t1",
    title: "Verilog AXIS FIFO",
    type: "T1",
    family: "verilog_axis_fifo",
    tags: "rtl / verilog / axis / fifo",
    checkpoints: 5,
    summary: "Cumulative AXI Stream FIFO evolution through pause controls, status depth, async behavior, and MARK_WHEN_FULL.",
    prompt: "checkpoint_5: Add MARK_WHEN_FULL FIFO behavior\n\nYou are given a writable baseline RTL repository in repo/. Your task is to implement the public behavior for this checkpoint while preserving all prior FIFO and pipeline behavior.\n\nPublic Goal\n\nImplement the MARK_WHEN_FULL FIFO option so frames that encounter a full FIFO condition can be retained and marked bad instead of being silently accepted as clean data or dropped through the wrong policy path.\n\nCandidate Modules\naxis_fifo, axis_async_fifo, axis_pipeline_fifo,\naxis_fifo_adapter, axis_async_fifo_adapter\n\nRequired Repository Behavior\n\nUpdate repo/rtl/axis_fifo.v, repo/rtl/axis_async_fifo.v, repo/rtl/axis_fifo_adapter.v, and repo/rtl/axis_async_fifo_adapter.v with MARK_WHEN_FULL behavior compatible with the public endpoint harness. Preserve axis_pipeline_fifo and all earlier FIFO features.\n\nMARK_WHEN_FULL is a separate full-condition policy from DROP_WHEN_FULL. It must work when LAST_ENABLE=1 and FRAME_FIFO=0, requires LAST_ENABLE=1, and must expose an observable bad-frame indication through USER_BAD_FRAME_MASK.\n\n[Excerpt. Open the source prompt for the complete contract.]",
    certDate: "2026-07-23",
    certSummary: "Passed. Five pipeline checkpoints and five SR wrappers cover their adjacent snapshot deltas with independent pass/fail checks; the current strict aggregate records 15 evaluations, 10 endpoint gates, 5 predecessor gates, and 0 failures.",
    readmePath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t1/README.md`,
    certPath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t1/evidence/certification.md`,
    promptPath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t1/pipeline/checkpoint_5.md`,
    checkpointLinks: [1, 2, 3, 4, 5].map((n) => [`checkpoint_${n}`, `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t1/pipeline/checkpoint_${n}.md`])
  },
  {
    number: "03",
    id: "verilog-axis-fifo-t2",
    title: "AXIS FIFO",
    type: "T2",
    family: "verilog_axis_fifo",
    tags: "rtl / verilog / axis / fifo / testbench",
    checkpoints: 1,
    summary: "Modernize a historical axis_fifo test flow from legacy MyHDL/pytest to focused cocotb/cocotb-test coverage under Icarus.",
    prompt: "Single-round checkpoint_1: Modernize the axis_fifo test suite\n\nYou are given a historical alexforencich/verilog-axis snapshot with the legacy MyHDL/pytest test flow. Your task is to modernize the axis_fifo test environment while preserving the public FIFO behavior.\n\nPublic Goal\n\nReplace the legacy axis_fifo test flow with a focused cocotb/cocotb-test style testbench that can exercise the same FIFO behavior under Icarus Verilog and provide a clearer behavioral oracle for ready/valid, pause, reset, tuser, and overflow behavior.\n\nScope\n\nTarget component: axis_fifo\n\nReference snapshots:\nlegacy: 2021-04-03_pre_tox_myhdl_travis_9d99ec0\nmodern: 2021-04-03_cocotb_testbenches_74c1014\n\nThe candidate should preserve the RTL behavior of axis_fifo and provide a focused modern testbench that can be run from the component test directory with Icarus Verilog.\n\n[Excerpt. Open the source prompt for the complete contract.]",
    certDate: "2026-07-15",
    certSummary: "Passed. The endpoint passed Structure 3/3 and Core 10/10 with no infrastructure failure; the adjacent predecessor failed the expected new Core checks while preserving the regression contract. The old failing certificate is explicitly marked stale.",
    readmePath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t2/README.md`,
    certPath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t2/evidence/certification.md`,
    promptPath: `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t2/pipeline/checkpoint_1.md`,
    checkpointLinks: [["checkpoint_1", `${REPO_ROOT}/blob/main/problems/verilog-axis-fifo-t2/pipeline/checkpoint_1.md`]]
  },
  {
    number: "04",
    id: "verilog-ethernet-t2",
    title: "Verilog Ethernet",
    type: "T2",
    family: "verilog_ethernet",
    tags: "rtl / verilog / ethernet",
    checkpoints: 3,
    summary: "Pure T2 Ethernet verification covering PTP, pause, FCS, dependency compatibility, and directed TX error recovery against evaluator-fixed RTL.",
    prompt: "checkpoint_3: Add TX underrun and error verification\n\nContinue from checkpoint_2. The RTL remains evaluator-fixed input and is not part of the candidate output.\n\nExtend both axis_gmii_tx and eth_mac_1g verification with directed TX underrun and TX error scenarios. Check the malformed/error indication for the affected frame, verify subsequent valid frames recover with correct payload and FCS, and finish with empty/drained sinks. Preserve all prior PTP, pause, LFC/PFC, reset, payload, FCS, and dependency-compatibility coverage.\n\nbash build_checkpoint.sh checkpoint_3 must update the same candidate TB/runner surface and continue to accept all earlier checkpoint names. Target RTL remains evaluator-only.\n\nThe evaluator runs the candidate TB against trusted checkpoint_3 target RTL and retains checkpoint_1 and checkpoint_2 verification requirements as Regression.",
    certDate: "2026-08-03",
    certSummary: "Passed. An independent read-only review verified six formal batches, snapshot and environment adjacency, oracle independence, locked RTL tree hashes, and no definition drift; pipeline C1-C3 and SR1-SR3 all remain passed.",
    readmePath: `${REPO_ROOT}/blob/main/problems/verilog-ethernet-t2/README.md`,
    certPath: `${REPO_ROOT}/blob/main/problems/verilog-ethernet-t2/evidence/certification.md`,
    promptPath: `${REPO_ROOT}/blob/main/problems/verilog-ethernet-t2/pipeline/checkpoint_3.md`,
    checkpointLinks: [1, 2, 3].map((n) => [`checkpoint_${n}`, `${REPO_ROOT}/blob/main/problems/verilog-ethernet-t2/pipeline/checkpoint_${n}.md`])
  },
  {
    number: "05",
    id: "taxi-axi-t3",
    title: "Taxi AXI",
    type: "T3",
    family: "taxi_axi",
    tags: "rtl / verilog / taxi / axi",
    checkpoints: 6,
    summary: "Six-checkpoint Taxi AXI evolution from FIFO baseline through AXI interconnect, crossbar, 1S variants, RTL stress, and dual-port RAM.",
    prompt: "checkpoint_6: Add AXI dual-port RAM\n\nYou are given a writable baseline RTL repository in repo/. Your task is to implement the public behavior for this checkpoint while preserving prior behavior.\n\nPublic Goal\n\nAdd the AXI RAM interface and dual-port AXI RAM so two AXI ports can safely share a memory-backed target while preserving the full prior AXI subsystem behavior.\n\nCandidate Modules\ntaxi_axi_ram_if_rdwr, taxi_axi_ram_if_rd, taxi_axi_ram_if_wr, taxi_axi_dp_ram\n\nRequired Repository Behavior\n\nThe checkpoint adds AXI memory-backed target support for two independent AXI ports while keeping the prior AXI interconnect and crossbar behavior active. Required public files include taxi_axi_dp_ram.sv, taxi_axi_ram_if_rd.sv, taxi_axi_ram_if_wr.sv, taxi_axi_ram_if_rdwr.sv, their file lists, and the focused taxi_axi_dp_ram cocotb testbench.\n\nThe evaluator reconstructs each endpoint from a pinned snapshot-specific Taxi Verilator Docker image and verifies the candidate RTL under behavior assertions independent of candidate testbenches.\n\n[Excerpt. Open the source prompt for the complete contract.]",
    certDate: "2026-08-03",
    certSummary: "Passed. The current deterministic corpus records 12 endpoint entrypoint/snapshot records and 12 predecessor records with infrastructure_failure=false; seven batches are state=passed with validator return code 0, input_drift=false, and matching frozen archive and manifest hashes.",
    readmePath: `${REPO_ROOT}/blob/main/problems/taxi-axi-t3/README.md`,
    certPath: `${REPO_ROOT}/blob/main/problems/taxi-axi-t3/evidence/certification.md`,
    promptPath: `${REPO_ROOT}/blob/main/problems/taxi-axi-t3/pipeline/checkpoint_6.md`,
    checkpointLinks: [1, 2, 3, 4, 5, 6].map((n) => [`checkpoint_${n}`, `${REPO_ROOT}/blob/main/problems/taxi-axi-t3/pipeline/checkpoint_${n}.md`])
  }
];

const SYNC_DATA_URL = "data/problems.json";
const SYNC_INTERVAL_MS = 60 * 1000;
let problems = FALLBACK_PROBLEMS;
let syncState = { status: "checking", generatedAt: "", signature: "" };
const app = document.getElementById("app");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;"}[character]));
const checkpointLabel = (count) => `${count} checkpoint${count === 1 ? "" : "s"}`;
const findProblem = (id) => problems.find((problem) => problem.id === id);

function syncTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function updateSyncStatus() {
  const status = document.getElementById("sync-status");
  if (!status) return;
  const timestamp = syncTimestamp(syncState.generatedAt);
  if (syncState.status === "synced") {
    status.dataset.syncState = "synced";
    status.textContent = `data source: GitHub snapshot${timestamp ? ` · synced ${timestamp}` : ""}`;
  } else if (syncState.status === "stale") {
    status.dataset.syncState = "stale";
    status.textContent = `data source: GitHub snapshot${timestamp ? ` · last synced ${timestamp}` : ""} · refresh pending`;
  } else if (syncState.status === "checking") {
    status.dataset.syncState = "checking";
    status.textContent = "data source: checking synchronized snapshot";
  } else {
    status.dataset.syncState = "fallback";
    status.textContent = "data source: bundled snapshot · sync unavailable";
  }
}

function normalizeSyncedProblems(payload) {
  const candidate = Array.isArray(payload) ? payload : payload?.problems;
  if (!Array.isArray(candidate) || !candidate.length) throw new Error("Synchronized problem data is empty");
  const valid = candidate.filter((problem) => problem && problem.id && problem.title && problem.type && (problem.prompt || problem.checkpointPrompts?.length));
  if (valid.length !== candidate.length) throw new Error("Synchronized problem data is incomplete");
  return valid;
}

function checkpointPromptsFor(problem) {
  if (Array.isArray(problem.checkpointPrompts) && problem.checkpointPrompts.length) return problem.checkpointPrompts;
  return (problem.checkpointLinks || []).map(([label, sourcePath]) => ({
    label,
    sourcePath,
    prompt: label === `checkpoint_${problem.checkpoints}`
      ? problem.prompt
      : "This checkpoint prompt will be populated by the next synchronized snapshot."
  }));
}

async function loadSyncedProblems() {
  try {
    const separator = SYNC_DATA_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${SYNC_DATA_URL}${separator}v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`sync request failed: ${response.status}`);
    const payload = await response.json();
    const nextProblems = normalizeSyncedProblems(payload);
    const signature = JSON.stringify(nextProblems);
    const previousSignature = syncState.signature;
    const wasFallback = problems === FALLBACK_PROBLEMS;
    syncState = { status: "synced", generatedAt: payload.generatedAt || "", signature };
    if (signature !== previousSignature || wasFallback) {
      problems = nextProblems;
      renderRoute();
    } else {
      updateSyncStatus();
    }
  } catch (error) {
    if (syncState.signature) syncState = { ...syncState, status: "stale" };
    else syncState = { status: "fallback", generatedAt: "", signature: "" };
    updateSyncStatus();
  }
}

function problemRow(problem) {
  return `<tr data-href="#review/${escapeHtml(problem.id)}" tabindex="0" aria-label="Review ${escapeHtml(problem.title)}">
    <td><span class="problem-number">${escapeHtml(problem.number)}</span></td>
    <td><div class="problem-name">${escapeHtml(problem.title)}</div><div class="problem-family">${escapeHtml(problem.family)}</div></td>
    <td><div class="problem-tags">${escapeHtml(problem.tags)}</div></td>
    <td><span class="problem-type">${escapeHtml(problem.type)}</span></td>
    <td class="difficulty-unset" aria-label="Difficulty not classified" title="Difficulty not classified"></td>
    <td>${escapeHtml(checkpointLabel(problem.checkpoints))}</td>
    <td><span class="status passed">passed</span><div class="problem-family">${escapeHtml(problem.certDate)}</div></td>
  </tr>`;
}

function renderHome() {
  const problemTotal = problems.length;
  const problemCount = String(problems.length).padStart(2, "0");
  app.innerHTML = `<section class="page">
    <div class="page-header">
      <div class="breadcrumb">SCBench / <span>problems</span></div>
      <h1>RTL problems / review index</h1>
      <p>${problemTotal} published problem packages. Select a problem number to inspect its prompt, certification evidence, and the reserved evaluation-results area.</p>
      <div class="release-line">release: rtl-problems-v0.2.0 · certification: ${problemTotal} / ${problemTotal} passed · difficulty: not classified</div>
      <div class="sync-status" id="sync-status" data-sync-state="checking"></div>
    </div>
    <div class="table-tools">
      <span class="count" id="visible-count">${problemCount} of ${problemCount} problems</span>
      <label><span class="sr-only">Filter problems</span><input class="filter-input" id="problem-filter" type="search" placeholder="filter problems (e.g. taxi, axis, hard)…" autocomplete="off" /></label>
    </div>
    <div class="table-wrap">
      <table class="problem-table">
        <thead><tr><th>#</th><th>problem</th><th>scope</th><th>type</th><th>difficulty</th><th>checkpoints</th><th>certification</th></tr></thead>
        <tbody id="problem-rows">${problems.map(problemRow).join("")}</tbody>
      </table>
    </div>
  </section>`;

  const filter = document.getElementById("problem-filter");
  const rows = document.getElementById("problem-rows");
  const visibleCount = document.getElementById("visible-count");
  filter.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    const matches = problems.filter((problem) => [problem.id, problem.title, problem.family, problem.tags, problem.type].join(" ").toLowerCase().includes(query));
    rows.innerHTML = matches.length ? matches.map(problemRow).join("") : `<tr><td class="empty-row" colspan="6">No matching problems.</td></tr>`;
    visibleCount.textContent = `${String(matches.length).padStart(2, "0")} of ${String(problems.length).padStart(2, "0")} problems`;
    bindRows();
  });
  bindRows();
}

function bindRows() {
  document.querySelectorAll("[data-href]").forEach((row) => {
    row.addEventListener("click", () => { window.location.hash = row.dataset.href.slice(1); });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); window.location.hash = row.dataset.href.slice(1); }
    });
  });
}

function renderReview(problem) {
  const checkpointPrompts = checkpointPromptsFor(problem);
  const checkpointCards = checkpointPrompts.map((checkpoint, index) => `<details class="checkpoint-card"${index === checkpointPrompts.length - 1 ? " open" : ""}>
      <summary class="checkpoint-summary"><span class="checkpoint-caret" aria-hidden="true"></span><span class="checkpoint-key">${escapeHtml(checkpoint.label)}</span><span class="checkpoint-title">${escapeHtml(problem.title)} / ${escapeHtml(checkpoint.label)} prompt</span><span class="checkpoint-state">view</span></summary>
      <div class="checkpoint-content"><pre class="prompt-block">${escapeHtml(checkpoint.prompt)}</pre>${checkpoint.sourcePath ? `<div class="prompt-actions"><a class="action-link" href="${escapeHtml(checkpoint.sourcePath)}" target="_blank" rel="noreferrer">source artifact ↗</a></div>` : ""}</div>
    </details>`).join("");
  app.innerHTML = `<section class="page">
    <div class="review-header">
      <a class="back-link" href="#problems">← all problems</a>
      <div class="review-title-row">
        <div><h1>${escapeHtml(problem.title)}</h1><p class="review-subtitle">${escapeHtml(problem.summary)}</p><div class="meta-row"><span class="meta-pill">${escapeHtml(problem.family)}</span><span class="meta-pill">type ${escapeHtml(problem.type)}</span><span class="meta-pill">${escapeHtml(checkpointLabel(problem.checkpoints))}</span><span class="meta-pill pass">certified / passed</span></div><div class="sync-status" id="sync-status" data-sync-state="checking"></div></div>
        <div class="review-id">review ${escapeHtml(problem.number)}<br />${escapeHtml(problem.id)}</div>
      </div>
    </div>
    <div class="review-grid">
      <div class="review-main">
        <section class="review-panel">
          <div class="panel-heading"><h2>Checkpoint prompts</h2><span>${escapeHtml(checkpointLabel(problem.checkpoints))}</span></div>
          <div class="panel-body"><div class="checkpoint-list">${checkpointCards}</div></div>
        </section>
        <section class="review-panel">
          <div class="panel-heading"><h2>Evaluation results</h2><span>reserved</span></div>
          <div class="panel-body"><div class="results-empty"><strong>No evaluation results published yet.</strong><p>This area is reserved for future round-by-round, model-level, and case-level results.</p><div class="results-schema"><div class="schema-cell">round / checkpoint</div><div class="schema-cell">model / runner</div><div class="schema-cell">pass rate / notes</div></div></div></div>
        </section>
      </div>
      <aside class="review-side">
        <section class="review-panel">
          <div class="panel-heading"><h2>Certification</h2><span>evidence</span></div>
          <div class="panel-body"><div class="cert-result"><div class="cert-mark">✓</div><div><strong>passed</strong><span>reviewed ${escapeHtml(problem.certDate)}</span></div></div><p class="cert-summary">${escapeHtml(problem.certSummary)}</p><div class="source-list"><a href="${escapeHtml(problem.certPath)}" target="_blank" rel="noreferrer">open certification certificate ↗</a><a href="${escapeHtml(problem.readmePath)}" target="_blank" rel="noreferrer">open repository package ↗</a></div></div>
        </section>
        <section class="review-panel"><div class="panel-heading"><h2>Review scope</h2><span>read-only</span></div><div class="panel-body"><p class="review-note">The prompt and certification evidence are the current source-of-truth artifacts. Evaluation results can be added later without changing this review surface.</p></div></section>
      </aside>
    </div>
  </section>`;
}

function renderRoute() {
  const match = window.location.hash.match(/^#review\/([^/]+)$/);
  const problem = match ? findProblem(decodeURIComponent(match[1])) : null;
  if (problem) renderReview(problem);
  else renderHome();
  window.scrollTo(0, 0);
  updateSyncStatus();
}

window.addEventListener("hashchange", renderRoute);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadSyncedProblems();
});
renderRoute();
loadSyncedProblems();
window.setInterval(loadSyncedProblems, SYNC_INTERVAL_MS);
