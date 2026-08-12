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
vm.runInNewContext(`${source.slice(start, end)}; globalThis.helpers = { experimentInfo, checkpointDisplayLabel };`, context);
const { experimentInfo, checkpointDisplayLabel } = context.helpers;

const srCheckpoint5 = { source_problem: "verilog_axis_fifo_t1_pipeline_sr_checkpoint_5" };
assert.equal(experimentInfo(srCheckpoint5).type, "sr");
assert.equal(experimentInfo(srCheckpoint5).targetCheckpoint, "checkpoint_5");
assert.equal(checkpointDisplayLabel(srCheckpoint5, { checkpoint: "checkpoint_1" }), "checkpoint_5");

const pipeline = { source_problem: "common_cells_t1_pipeline" };
assert.equal(experimentInfo(pipeline).type, "pipeline");
assert.equal(checkpointDisplayLabel(pipeline, { checkpoint: "checkpoint_3" }), "checkpoint_3");

const synchronizedSr = { experimentType: "sr", targetCheckpoint: "checkpoint_3" };
assert.equal(checkpointDisplayLabel(synchronizedSr, { localCheckpoint: "checkpoint_1", targetCheckpoint: "checkpoint_3" }), "checkpoint_3");

const syncWithoutImports = syncSource
  .replace(/^import[^\n]+\n/gm, "")
  .replace(/const SCRIPT_DIR[^\n]+\n/, 'const SCRIPT_DIR = ".";\n')
  .replace(/main\(\)\.catch\([\s\S]*$/, "");
new vm.Script(`(async () => { ${syncWithoutImports} })`, { filename: "sync-github.mjs" });

console.log("experiment metadata tests passed");
