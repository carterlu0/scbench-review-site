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

function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  return html;
}

function renderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = "";
    }
  };
  const closeBlocks = () => {
    flushParagraph();
    closeList();
  };
  const tableCells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const tableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*```\s*([^\s]*)\s*$/);
    if (fence) {
      if (inCode) {
        const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
        output.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        codeLanguage = "";
        inCode = false;
      } else {
        closeBlocks();
        codeLanguage = fence[1];
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeBlocks();
      continue;
    }
    if (line.includes("|") && tableSeparator(lines[index + 1] || "")) {
      closeBlocks();
      const headers = tableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      closeBlocks();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeBlocks();
      output.push("<hr />");
      continue;
    }
    const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextListType = ordered ? "ol" : "ul";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${renderInlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    const listContinuation = line.match(/^\s{2,}(.+)$/);
    if (listType && listContinuation) {
      const lastItem = output.length - 1;
      output[lastItem] = output[lastItem].replace(/<\/li>$/, ` ${renderInlineMarkdown(listContinuation[1].trim())}</li>`);
      continue;
    }
    if (listType) closeList();
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  if (inCode) {
    output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  } else {
    closeBlocks();
  }
  return output.join("\n");
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = nextTheme;
  localStorage.setItem("scbench-theme", nextTheme);
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === nextTheme));
  });
}

function bindThemeSwitch() {
  setTheme(localStorage.getItem("scbench-theme") || "dark");
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
  });
}

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

function durationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

function runOutcome(run) {
  const value = String(run?.outcome || "unknown").toLowerCase();
  return ["passed", "failed", "error"].includes(value) ? value : "unknown";
}

function experimentInfo(run) {
  const srMatch = String(run?.source_problem || "").match(/(?:^|_)pipeline_sr_checkpoint_(\d+)$/i);
  const type = run?.experimentType === "sr" || srMatch ? "sr" : "pipeline";
  const targetCheckpoint = run?.targetCheckpoint || (srMatch ? `checkpoint_${Number(srMatch[1])}` : "");
  return { type, targetCheckpoint };
}

function checkpointDisplayLabel(run, checkpoint) {
  const experiment = experimentInfo(run);
  return checkpoint?.targetCheckpoint || experiment.targetCheckpoint || checkpoint?.checkpoint || "checkpoint";
}

function runTimestamp(run) {
  const parsed = Date.parse(run?.exported_at || "");
  if (Number.isFinite(parsed)) return parsed;
  const runId = String(run?.run_id || "").replace(/\D/g, "");
  return Number(runId) || 0;
}

function compareRunsNewest(first, second) {
  const timeDifference = runTimestamp(second) - runTimestamp(first);
  if (timeDifference) return timeDifference;
  return String(second?.run_id || "").localeCompare(String(first?.run_id || ""), undefined, { numeric: true });
}

function modelAgentLabel(run) {
  return `${run?.model || "model not recorded"} + ${run?.agent?.type || "agent"} ${run?.agent?.version || "version not recorded"}`;
}

function experimentKey(run) {
  const experiment = experimentInfo(run);
  return String(run?.source_problem || `${experiment.type}:${experiment.targetCheckpoint || "all"}`);
}

function experimentLabel(run) {
  const experiment = experimentInfo(run);
  if (experiment.type === "sr") return `SR / ${experiment.targetCheckpoint || "checkpoint"}`;
  const pipelineSuffix = String(run?.source_problem || "").match(/_pipeline(?:_(.+))?$/i)?.[1];
  if (!pipelineSuffix) return "Pipeline";
  return `Pipeline / ${pipelineSuffix.replace(/_/g, " ")}`;
}

function splitCurrentAndHistoricalRuns(runs) {
  const newestByExperiment = new Map();
  const historical = [];
  [...runs].sort(compareRunsNewest).forEach((run) => {
    const key = `${modelAgentLabel(run)}|${experimentKey(run)}`;
    if (newestByExperiment.has(key)) historical.push(run);
    else newestByExperiment.set(key, run);
  });
  return {
    current: [...newestByExperiment.values()].sort(compareRunsNewest),
    historical: historical.sort(compareRunsNewest)
  };
}

function resultMetricChips(evaluation) {
  const counts = evaluation?.counts || {};
  const labels = { structure: "structure", core: "core", functionality: "function", regression: "regression" };
  const chips = Object.entries(labels).flatMap(([key, label]) => {
    const value = counts[key];
    return Array.isArray(value) && value.length === 2 ? [`<span class="result-metric"><b>${escapeHtml(label)}</b>${escapeHtml(value[0])}/${escapeHtml(value[1])}</span>`] : [];
  });
  if (evaluation?.core_gate_passed !== undefined) {
    chips.push(`<span class="result-metric ${evaluation.core_gate_passed ? "metric-pass" : "metric-fail"}"><b>core gate</b>${evaluation.core_gate_passed ? "passed" : "blocked"}</span>`);
  }
  return chips.join("");
}

function renderEvaluationRunGroups(runs) {
  if (!runs.length) {
    return `<div class="results-empty"><strong>No results in this view.</strong><p>New evaluation records will appear here after synchronization.</p></div>`;
  }
  const evaluatedRuns = runs.filter((run) => run.checkpoints?.some((checkpoint) => checkpoint.evaluation)).length;
  const passedRuns = runs.filter((run) => runOutcome(run) === "passed").length;
  const infrastructureFailures = runs.filter((run) => run.checkpoints?.some((checkpoint) => checkpoint.evaluation?.infrastructure_failure)).length;
  const renderRunCard = (run) => {
    const outcome = runOutcome(run);
    const experiment = experimentInfo(run);
    const checkpointRows = (run.checkpoints || []).map((checkpoint) => {
      const evaluation = checkpoint.evaluation;
      const state = String(checkpoint.state || "unknown").toLowerCase();
      const displayCheckpoint = checkpointDisplayLabel(run, checkpoint);
      const localNote = experiment.type === "sr" && checkpoint.localCheckpoint && checkpoint.localCheckpoint !== displayCheckpoint
        ? ` · local wrapper step ${checkpoint.localCheckpoint}`
        : "";
      const evaluatorNote = evaluation
        ? `pytest ${escapeHtml(evaluation.pytest_exit_code)}${evaluation.infrastructure_failure ? " · infrastructure failure" : ""}`
        : "no evaluator result";
      return `<div class="run-checkpoint-row"><div><span class="run-state state-${escapeHtml(state)}">${escapeHtml(state)}</span><strong>${escapeHtml(displayCheckpoint)}</strong><span class="run-duration">${escapeHtml(durationLabel(checkpoint.duration_seconds))}</span></div><div class="run-checkpoint-detail"><div class="result-metrics">${resultMetricChips(evaluation)}</div><span>${evaluatorNote}${escapeHtml(localNote)}</span></div></div>`;
    }).join("");
    const progressLabel = experiment.type === "sr"
      ? `${experiment.targetCheckpoint || "checkpoint not recorded"} · single-round wrapper`
      : `${escapeHtml(run.completed_checkpoints || 0)} / ${escapeHtml(run.expected_checkpoints || "?")} checkpoints`;
    return `<article class="run-card">
      <div class="run-card-header"><div><div class="run-labels"><span class="experiment-badge experiment-${experiment.type}">${escapeHtml(experimentLabel(run))}</span><span class="run-outcome outcome-${outcome}">${escapeHtml(outcome)}</span></div><h3>${escapeHtml(run.model || "model not recorded")}</h3><p>${escapeHtml(run.agent?.type || "agent")} ${escapeHtml(run.agent?.version || "")} · ${escapeHtml(run.prompt || "prompt not recorded")} · ${escapeHtml(run.thinking || "thinking not recorded")}</p></div>${run.sourcePath ? `<a class="action-link" href="${escapeHtml(run.sourcePath)}" target="_blank" rel="noreferrer">run record ↗</a>` : ""}</div>
      <div class="run-meta"><span>run ${escapeHtml(run.run_id || "unknown")}</span><span>${escapeHtml(syncTimestamp(run.exported_at) || "time not recorded")}</span><span>${experiment.type === "sr" ? escapeHtml(progressLabel) : progressLabel}</span></div>
      <div class="run-checkpoint-list">${checkpointRows || `<p class="run-empty">No checkpoint details recorded.</p>`}</div>
    </article>`;
  };
  const experimentGroups = [
    { type: "pipeline", title: "Pipeline experiments", description: "Sequential runs across the published checkpoint pipeline." },
    { type: "sr", title: "SR experiments", description: "Single-round wrappers evaluated against the checkpoint shown on each card." }
  ].flatMap((group) => {
    const groupRuns = runs.filter((run) => experimentInfo(run).type === group.type);
    if (!groupRuns.length) return [];
    return [`<section class="experiment-group"><div class="experiment-group-heading"><div><h3>${group.title}</h3><p>${group.description}</p></div><span>${groupRuns.length} run${groupRuns.length === 1 ? "" : "s"}</span></div><div class="results-runs">${groupRuns.map(renderRunCard).join("")}</div></section>`];
  }).join("");
  const pipelineRuns = runs.filter((run) => experimentInfo(run).type === "pipeline").length;
  const srRuns = runs.length - pipelineRuns;
  return `<div class="results-overview"><div><strong>${pipelineRuns}</strong><span>pipeline runs</span></div><div><strong>${srRuns}</strong><span>SR runs</span></div><div><strong>${passedRuns}</strong><span>passed</span></div><div><strong>${infrastructureFailures}</strong><span>infra failures</span></div></div>${experimentGroups}`;
}

function evaluationHistoryHash(problem) {
  return `#review/${encodeURIComponent(problem.id)}/history`;
}

function renderEvaluationResults(problem) {
  const allRuns = Array.isArray(problem.evaluationRuns) ? problem.evaluationRuns : [];
  if (!allRuns.length) {
    return `<div class="results-empty"><strong>No evaluation results published yet.</strong><p>This area is reserved for future round-by-round, model-level, and case-level results.</p><div class="results-schema"><div class="schema-cell">round / checkpoint</div><div class="schema-cell">model / runner</div><div class="schema-cell">pass rate / notes</div></div></div>`;
  }
  const { current, historical } = splitCurrentAndHistoricalRuns(allRuns);
  const historyAction = historical.length
    ? `<a class="action-link" href="${evaluationHistoryHash(problem)}">view ${historical.length} historical run${historical.length === 1 ? "" : "s"} →</a>`
    : `<span class="results-current-note">all results are current</span>`;
  return `<div class="results-current-heading"><div><strong>${current.length} current result${current.length === 1 ? "" : "s"}</strong><span>Latest run per model, agent version, and experiment type.</span></div>${historyAction}</div>${renderEvaluationRunGroups(current)}`;
}

function evaluationCounts(problem) {
  const runs = Array.isArray(problem.evaluationRuns) ? problem.evaluationRuns : [];
  if (!runs.length) return { current: 0, historical: 0 };
  const split = splitCurrentAndHistoricalRuns(runs);
  return { current: split.current.length, historical: split.historical.length };
}

function renderEvaluationHistory(problem) {
  const allRuns = Array.isArray(problem.evaluationRuns) ? problem.evaluationRuns : [];
  const { historical } = splitCurrentAndHistoricalRuns(allRuns);
  app.innerHTML = `<section class="page">
    <div class="review-header">
      <a class="back-link" href="#review/${encodeURIComponent(problem.id)}">← current evaluation results</a>
      <div class="review-title-row">
        <div><h1>${escapeHtml(problem.title)}</h1><p class="review-subtitle">Historical evaluation results</p><div class="meta-row"><span class="meta-pill">${escapeHtml(problem.family)}</span><span class="meta-pill">type ${escapeHtml(problem.type)}</span><span class="meta-pill">${historical.length} historical run${historical.length === 1 ? "" : "s"}</span></div><div class="sync-status" id="sync-status" data-sync-state="checking"></div></div>
        <div class="review-id">history<br />${escapeHtml(problem.id)}</div>
      </div>
    </div>
    <section class="review-panel history-panel">
      <div class="panel-heading"><h2>Evaluation history</h2><span>archived results</span></div>
      <div class="panel-body">${renderEvaluationRunGroups(historical)}</div>
    </section>
  </section>`;
}

function renderReview(problem) {
  const checkpointPrompts = checkpointPromptsFor(problem);
  const resultCounts = evaluationCounts(problem);
  const overviewCard = problem.overview ? `<section class="review-panel">
          <div class="panel-heading"><h2>Problem overview</h2><span>README</span></div>
          <div class="panel-body"><details class="overview-card" open>
            <summary><span>Detailed problem description</span><span class="overview-toggle">collapse</span></summary>
            <article class="overview-markdown">${renderMarkdown(problem.overview)}</article>
            ${problem.readmePath ? `<div class="prompt-actions"><a class="action-link" href="${escapeHtml(problem.readmePath)}" target="_blank" rel="noreferrer">source README ↗</a></div>` : ""}
          </details></div>
        </section>` : "";
  const checkpointCards = checkpointPrompts.map((checkpoint, index) => `<details class="checkpoint-card"${index === checkpointPrompts.length - 1 ? " open" : ""}>
      <summary class="checkpoint-summary"><span class="checkpoint-caret" aria-hidden="true"></span><span class="checkpoint-key">${escapeHtml(checkpoint.label)}</span><span class="checkpoint-title">${escapeHtml(problem.title)} / ${escapeHtml(checkpoint.label)} prompt</span><span class="checkpoint-state">view</span></summary>
      <div class="checkpoint-content"><article class="prompt-markdown">${renderMarkdown(checkpoint.prompt)}</article>${checkpoint.sourcePath ? `<div class="prompt-actions"><a class="action-link" href="${escapeHtml(checkpoint.sourcePath)}" target="_blank" rel="noreferrer">source artifact ↗</a></div>` : ""}</div>
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
        ${overviewCard}
        <section class="review-panel">
          <div class="panel-heading"><h2>Checkpoint prompts</h2><span>${escapeHtml(checkpointLabel(problem.checkpoints))}</span></div>
          <div class="panel-body"><div class="checkpoint-list">${checkpointCards}</div></div>
        </section>
        <section class="review-panel">
          <div class="panel-heading"><h2>Evaluation results</h2><span>${Array.isArray(problem.evaluationRuns) ? `${resultCounts.current} current${resultCounts.historical ? ` · ${resultCounts.historical} history` : ""}` : "reserved"}</span></div>
          <div class="panel-body">${renderEvaluationResults(problem)}</div>
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
  const match = window.location.hash.match(/^#review\/([^/]+)(?:\/(history))?$/);
  const problem = match ? findProblem(decodeURIComponent(match[1])) : null;
  if (problem && match[2] === "history") renderEvaluationHistory(problem);
  else if (problem) renderReview(problem);
  else renderHome();
  window.scrollTo(0, 0);
  updateSyncStatus();
}

window.addEventListener("hashchange", renderRoute);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadSyncedProblems();
});
renderRoute();
bindThemeSwitch();
loadSyncedProblems();
window.setInterval(loadSyncedProblems, SYNC_INTERVAL_MS);
