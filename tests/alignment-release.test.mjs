import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {latestCells, modelKey, finalResult} from '../experiments-core.mjs';

const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));

test('aligned release keeps four columns, precise supersession and immutable retained evidence',async()=>{
  const catalog=await load('experiments/catalog.json');
  const analysis=await load(`experiments/analyses/${catalog.default_analysis}.json`);
  const release=analysis.publication;
  assert.equal(release.version,'four-effort-alignment-20261029-v1');
  assert.equal(release.regenerated_groups,48);
  assert.equal(release.candidate_reevaluations,14);
  assert.equal(release.selected_candidate_reevaluations,5);
  assert.equal(release.superseded_candidate_reevaluations,9);
  assert.equal(release.additional_prompt_regenerations,40);
  assert.equal(release.entrypoint_prompt_regenerations,44);
  assert.equal(release.remaining_prompt_difference_groups.length,0);
  assert.equal(release.execution_concurrency.global_max_parallel,8);
  assert.equal(release.execution_concurrency.previous_global_max_parallel,4);
  const previous=await load(`experiments/analyses/${release.previous_analysis}.json`);
  const cells=latestCells(analysis.cells);
  assert.equal(cells.length,356);
  assert.equal(new Set(cells.map(modelKey)).size,4);
  for(const thinking of ['low','medium','high','xhigh']){
    const group=cells.filter(c=>c.thinking===thinking);
    assert.equal(group.length,89);
    assert.equal(group.filter(c=>c.mode==='pipeline').length,15);
    assert.equal(group.filter(c=>c.mode==='sr').length,74);
  }
  const replaced=new Map(release.replacements.map(r=>[r.source_cell,r.cell]));
  const reevaluated=new Set(release.candidate_reevaluation_summary.filter(r=>!r.superseded_by_new_generation).map(r=>r.cell));
  const selected=new Map(cells.map(c=>[c.id,c]));
  let retained=0;
  for(const cell of previous.cells){
    if(replaced.has(cell.id)){
      assert.ok(!selected.has(cell.id));
      assert.ok(selected.has(replaced.get(cell.id)));
    }else if(!reevaluated.has(cell.id)){
      assert.deepEqual(selected.get(cell.id),cell);retained++;
    }
  }
  assert.equal(retained,303);
  for(const row of release.replacements){
    const cell=selected.get(row.cell);
    assert.equal(cell.status,'completed');assert.notEqual(cell.score,null);
    if(cell.mode==='pipeline'){
      const result=finalResult(cell,cells);
      assert.ok(Number.isInteger(result.total)&&result.total>0,cell.problem);
      assert.ok(Number.isInteger(result.passed)&&result.passed>=0&&result.passed<=result.total,cell.problem);
    }
  }
});

test('aligned default has four complete paper metric settings',async()=>{
  const catalog=await load('experiments/catalog.json');
  const report=await load(`paper/reports/${catalog.default_analysis}.json`);
  assert.equal(report.groups.length,4);
  const expectedFc={high:0.5734126446569767,medium:0.33132053377281373,low:0.22595245937637243,xhigh:0.5672448086615546};
  for(const group of report.groups){
    assert.deepEqual(group.issues,[]);
    assert.equal(group.coverage.num_chains,15);
    assert.equal(group.coverage.num_checkpoints,74);
    for(const metric of Object.values(group.primary))assert.notEqual(metric.value,null);
    assert.ok(Math.abs(group.primary.pipeline_fc.value-expectedFc[group.config.thinking])<1e-12);
  }
});
