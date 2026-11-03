import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {selectCells} from '../experiments-core.mjs';
import {renderLatestStatus, renderLatestFailures} from '../experiments.mjs';
import {renderPaperMetrics, selectPaperGroups, simulateThresholdGroup, pipelineCheckpointPassRate} from '../paper-metrics.mjs';

const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const data=await load('results/latest.json');
const frozen='e5fd63bae542d4f07bc711abf1792ed6a356298138c17c8873ba377d3927472b';

test('current view contains six unique complete settings and the recomputed frozen metrics',()=>{
  assert.equal(data.report.groups.length,6);
  assert.equal(data.cells.length,534);
  assert.equal(new Set(data.report.groups.map(g=>`${g.config.model}/${g.config.thinking}`)).size,6);
  const expected={low:[1/15,0.21055555555555555,0.30002470355731226,19/74],medium:[2/15,0.23833333333333334,0.31410489916587475,31/74],high:[3/15,0.27166666666666667,0.6212004931569692,40/74],xhigh:[5/15,0.34,0.7558546703973533,47/74]};
  for(const group of data.report.groups){
    assert.deepEqual(group.issues,[]);
    assert.equal(group.configuration_bindings.length,89);
    const primary=Object.values(group.primary);
    assert.deepEqual(primary.map(m=>m.denominator),[15,15,15,74]);
    assert.ok(primary.every(m=>m.reason===null&&m.known_units===m.denominator));
    if(group.config.model==='gpt-6-luna')primary.forEach((m,i)=>assert.ok(Math.abs(m.value-expected[group.config.thinking][i])<1e-12));
    if(group.config.model!=='gpt-6.1-terra')assert.equal(group.source_analysis,frozen);
    const records=data.records.groups.find(g=>g.id===group.id);
    const simulated=simulateThresholdGroup(group,records);
    for(const key of ['pipeline_fdr','pipeline_cc','pipeline_fc'])assert.ok(Math.abs(simulated[key].value-group.primary[key].value)<1e-12);
    for(const type of Object.keys(group.by_task_type)){
      const selected=simulateThresholdGroup(group,records,'core-case',type);
      assert.equal(selected.pipeline_fdr.denominator,group.by_task_type[type].primary.pipeline_fdr.denominator);
      assert.ok(pipelineCheckpointPassRate(group,records,type).denominator>0);
    }
  }
});

test('current problem details preserve the selected candidate and evaluation identities',async()=>{
  const sources=new Map();
  for(const source of data.sources){
    const bytes=await readFile(new URL(`experiments/${source.path}`,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
    const analysis=JSON.parse(bytes);
    if(Object.keys(analysis.detail_paths||{}).length)analysis.cells=(await Promise.all(Object.values(analysis.detail_paths).map(path=>load(`experiments/${path}`)))).flatMap(p=>p.cells);
    sources.set(source.analysis_id,new Map(analysis.cells.map(c=>[c.id,c])));
  }
  let count=0;
  for(const [problem,detail] of Object.entries(data.details)){
    const bytes=await readFile(new URL(`results/${detail.path}`,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),detail.sha256);
    for(const cell of JSON.parse(bytes).cells){
      count++;
      assert.equal(cell.problem,problem);
      const group=data.report.groups.find(g=>g.config.model===cell.model&&g.config.thinking===cell.thinking);
      const original=sources.get(group.source_analysis).get(cell.id);
      for(const cp of cell.checkpoints){
        const selected=original.checkpoints.find(c=>c.target_checkpoint===cp.target_checkpoint);
        for(const key of ['state','candidate','inference_sha256','evaluation_sha256'])assert.equal(cp[key],selected[key]);
      }
    }
  }
  assert.equal(count,534);
});

test('latest tables filter by effort, retain resources, and list every failure once',()=>{
  const filters={model:'gpt-6-luna',thinking:'low'};
  assert.equal(selectPaperGroups(data.report,filters).length,1);
  assert.equal(selectCells(data,filters).length,89);
  const html=renderPaperMetrics(data.report,{},new URLSearchParams(),data.records);
  assert.match(html,/paper-primary/);
  assert.match(html,/paper-resources/);
  assert.match(html,/paper-auxiliary/);
  assert.doesNotMatch(html,/repeat 0/);
  for(const g of data.report.groups)assert.ok(!html.includes(g.config.protocol));
  assert.equal(data.nonpass_units.length,404);
  assert.equal(data.group_status.reduce((n,g)=>n+g.pending,0),0);
  assert.equal(new Set(data.nonpass_units.map(r=>r.cell_id+r.target_checkpoint)).size,404);
  const failures=renderLatestFailures(data);
  assert.match(failures,/all 404 nonpass outcomes/);
  assert.match(failures,/3 nonselected retry failures/);
  assert.match(renderLatestFailures(data,filters),/all 91 nonpass outcomes/);
  assert.match(renderLatestStatus(data,filters),/148/);
});
