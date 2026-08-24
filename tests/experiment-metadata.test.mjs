import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../sync-github.mjs", import.meta.url), "utf8");
const start = source.indexOf("function experimentInfo");
const end = source.indexOf("function resultMetricChips", start);
assert.notEqual(start, -1, "experimentInfo must exist");
assert.notEqual(end, -1, "experiment helpers must precede resultMetricChips");

const context = {};
vm.runInNewContext(`${source.slice(start, end)}; globalThis.helpers = { experimentInfo, checkpointDisplayLabel, experimentKey, splitCurrentAndHistoricalRuns };`, context);
const { experimentInfo, checkpointDisplayLabel, experimentKey, splitCurrentAndHistoricalRuns } = context.helpers;

const srCheckpoint5 = { source_problem: "verilog_axis_fifo_t1_pipeline_sr_checkpoint_5" };
assert.equal(experimentInfo(srCheckpoint5).type, "sr");
assert.equal(experimentInfo(srCheckpoint5).targetCheckpoint, "checkpoint_5");
assert.equal(checkpointDisplayLabel(srCheckpoint5, { checkpoint: "checkpoint_1" }), "checkpoint_5");

const pipeline = { source_problem: "common_cells_t1_pipeline" };
assert.equal(experimentInfo(pipeline).type, "pipeline");
assert.equal(checkpointDisplayLabel(pipeline, { checkpoint: "checkpoint_3" }), "checkpoint_3");

const synchronizedSr = { experimentType: "sr", targetCheckpoint: "checkpoint_3" };
assert.equal(checkpointDisplayLabel(synchronizedSr, { localCheckpoint: "checkpoint_1", targetCheckpoint: "checkpoint_3" }), "checkpoint_3");

const repeatPipeline = (runId, exportedAt) => ({
  run_id: runId,
  exported_at: exportedAt,
  model: "agicto-gpt-5.6-luna",
  agent: { type: "codex", version: "0.141.0" },
  source_problem: "common_cells_t1_pipeline"
});
const latestPipeline = repeatPipeline("20260813t182340", "2026-08-13T20:16:18Z");
const olderPipeline = repeatPipeline("20260812t221238", "2026-08-13T10:19:26Z");
const sr1 = { ...repeatPipeline("20260811t181329", "2026-08-11T18:49:23Z"), source_problem: "common_cells_t1_pipeline_sr_checkpoint_1" };
const sr2 = { ...repeatPipeline("20260811t204048", "2026-08-11T21:14:57Z"), source_problem: "common_cells_t1_pipeline_sr_checkpoint_2" };
const structurePipeline = { ...repeatPipeline("20260814t090000", "2026-08-14T09:00:00Z"), source_problem: "common_cells_t1_pipeline_structure_cases" };
const corePipeline = { ...repeatPipeline("20260814t100000", "2026-08-14T10:00:00Z"), source_problem: "common_cells_t1_pipeline_core_cases" };
const split = splitCurrentAndHistoricalRuns([olderPipeline, sr1, latestPipeline, sr2, structurePipeline, corePipeline]);
assert.equal(split.current.length, 5, "SR checkpoints and pipeline case types must remain separate current results");
assert.equal(split.historical.length, 1, "only the older duplicate pipeline run belongs in history");
assert.equal(split.current[0].run_id, "20260814t100000", "current results are sorted newest first");
assert.equal(split.historical[0].run_id, "20260812t221238");
assert.notEqual(experimentKey(structurePipeline), experimentKey(corePipeline));

const markdownStart = source.indexOf("const escapeHtml");
const markdownEnd = source.indexOf("function setTheme", markdownStart);
assert.notEqual(markdownStart, -1, "markdown helpers must exist");
assert.notEqual(markdownEnd, -1, "markdown helpers must end before theme handling");
const markdownContext = {};
vm.runInNewContext(`${source.slice(markdownStart, markdownEnd)}; globalThis.renderMarkdownForTest = renderMarkdown;`, markdownContext);
const overviewMarkdown = markdownContext.renderMarkdownForTest("# Overview\n\n| checkpoint | Core |\n| --- | ---: |\n| checkpoint_1 | 7 |\n\nDetailed text.");
assert.match(overviewMarkdown, /<table>/, "README tables must render as tables");
assert.match(overviewMarkdown, /checkpoint_1/, "README table cells must remain visible");
assert.match(overviewMarkdown, /<h1>Overview<\/h1>/, "README headings must render");

assert.match(syncSource, /overview:\s*cleanPrompt\(readme\)/, "sync payload must include the README overview");
assert.match(syncSource, /schemaVersion:\s*5/, "overview data requires the current schema version");

const syncWithoutImports = syncSource
  .replace(/^import[^\n]+\n/gm, "")
  .replace(/const SCRIPT_DIR[^\n]+\n/, 'const SCRIPT_DIR = ".";\n')
  .replace(/main\(\)\.catch\([\s\S]*$/, "");
new vm.Script(`(async () => { ${syncWithoutImports} })`, { filename: "sync-github.mjs" });

console.log("experiment metadata tests passed");
