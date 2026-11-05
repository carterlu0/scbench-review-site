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

test('current view retains six complete Codex settings alongside OpenCode',()=>{
  assert.equal(data.report.groups.length,7);
  assert.equal(data.cells.length,623);
  assert.equal(new Set(data.report.groups.map(g=>`${g.config.model}/${g.config.agent}/${g.config.thinking}`)).size,7);
  const expected={low:[1/15,0.21055555555555555,0.30002470355731226,19/74],medium:[2/15,0.23833333333333334,0.31410489916587475,31/74],high:[3/15,0.27166666666666667,0.6212004931569692,40/74],xhigh:[5/15,0.34,0.7558546703973533,47/74]};
  for(const group of data.report.groups.filter(g=>g.config.agent==='codex')){
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
      const group=data.report.groups.find(g=>g.config.model===cell.model&&g.config.agent===cell.agent&&g.config.thinking===cell.thinking);
      const original=sources.get(group.source_analysis).get(cell.id);
      for(const cp of cell.checkpoints){
        const selected=original.checkpoints.find(c=>c.target_checkpoint===cp.target_checkpoint);
        for(const key of ['state','candidate','inference_sha256','evaluation_sha256'])assert.equal(cp[key],selected[key]);
      }
    }
  }
  assert.equal(count,623);
});

test('SR RFR counts binary failures only among valid noninitial checkpoints',()=>{
  const expected={
    'gpt-6-luna/low':[10,53], 'gpt-6-luna/medium':[7,56],
    'gpt-6-luna/high':[7,56], 'gpt-6-luna/xhigh':[6,59],
    'gpt-6.1-sol/high':[7,59], 'gpt-6.1-terra/high':[3,58],
  };
  for(const group of data.report.groups.filter(g=>g.config.agent==='codex')){
    const rows=data.records.groups.find(g=>g.id===group.id).checkpoint_records;
    const valid=rows.filter(r=>r.mode==='sr'&&r.checkpoint_index>1
      &&r.execution_status==='executed'&&!r.regression_result_exclusion
      &&!['delivery_failure','provisional_agent_failure'].includes(r.reason)
      &&r.groups?.regression?.applicable
      &&!r.groups.regression.error&&!r.groups.regression.not_executed);
    const failures=valid.filter(r=>r.groups.regression.passed<r.groups.regression.expected);
    const metric=group.auxiliary.sr_regression_failure_rate;
    assert.deepEqual([failures.length,valid.length],expected[`${group.config.model}/${group.config.thinking}`]);
    assert.equal(metric.numerator,failures.length);
    assert.equal(metric.denominator,valid.length);
    assert.equal(metric.value,failures.length/valid.length);
    assert.equal(metric.excluded_checkpoints.chain_initial_checkpoint,15);
    for(const r of rows.filter(r=>r.reason==='delivery_failure'))assert.equal(r.strict_pass,0);
    for(const [type,subset] of Object.entries(group.by_task_type)){
      // Task types are assigned at chain level, so use their chain membership.
      const ids=new Set(subset.chains.map(c=>c.chain_id));
      const cohort=valid.filter(r=>ids.has(r.chain_id));
      const failed=cohort.filter(r=>r.groups.regression.passed<r.groups.regression.expected);
      const rfr=subset.auxiliary.sr_regression_failure_rate;
      assert.equal(rfr.denominator,cohort.length,type);
      assert.equal(rfr.numerator,failed.length,type);
      assert.equal(rfr.value,failed.length/cohort.length,type);
    }
  }
  const html=renderPaperMetrics(data.report,{},new URLSearchParams(),data.records);
  assert.match(html,/counts checkpoints with at least one failed Regression check/);
  assert.match(html,/delivery failures still score as failures elsewhere/);
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
  assert.equal(data.nonpass_units.filter(r=>r.agent==='codex').length,404);
  assert.equal(data.group_status.filter(g=>g.agent==='codex').reduce((n,g)=>n+g.pending,0),0);
  assert.equal(new Set(data.nonpass_units.map(r=>r.cell_id+r.target_checkpoint)).size,data.nonpass_units.length);
  const failures=renderLatestFailures(data);
  assert.ok(failures.includes(`all ${data.nonpass_units.length} nonpass outcomes`));
  assert.match(failures,/3 nonselected retry failures/);
  assert.match(renderLatestFailures(data,filters),/all 91 nonpass outcomes/);
  assert.match(renderLatestStatus(data,filters),/148/);
});

test('Standard costs agree across summaries, trial details and both cache exports',async()=>{
  const {applyRecordCosts,csv}=await import('../experiments-core.mjs');
  for(const model of ['gpt-6.1-sol','gpt-6.1-terra']){
    const group=data.report.groups.find(g=>g.config.model===model);
    const records=data.records.groups.find(g=>g.id===group.id).checkpoint_records;
    for(const policy of ['actual','fixed_85'])for(const mode of ['pipeline','sr']){
      const resource=group.resources[`${mode}_${policy}`];
      assert.equal(resource.known_cost_records,74);
      assert.deepEqual(resource.cost_missing_reasons,{});
      const total=records.filter(r=>r.mode===mode).reduce((sum,r)=>sum+r.costs[policy].usd,0);
      assert.ok(Math.abs(resource.total_cost_usd-total)<1e-10);
    }
    assert.ok(group.efficiencies.sr_cpr_actual.cost_efficiency_per_usd>0);
  }
  for(const detail of Object.values(data.details)){
    for(const cell of (await load(`results/${detail.path}`)).cells){
      if(!cell.model.startsWith('gpt-6.1-')||cell.agent!=='codex')continue;
      const projected=applyRecordCosts([cell],data.records,data.report.price_version)[0];
      // Python 3.12 compensated sum and JavaScript's sequential reduce can
      // differ in the last floating-point bit when projecting the same costs.
      assert.ok(Math.abs(projected.official_cost_selected_attempt-cell.official_cost_selected_attempt)<1e-12);
      assert.ok(cell.official_cost_selected_attempt>=0);
      assert.ok(csv([cell]).includes(data.report.price_version));
      for(const cp of cell.checkpoints){
        assert.equal(cp.official_cost.usd,cp.costs.actual.usd);
        assert.ok(cp.official_cost.usd>=0);
        assert.ok('original_official_cost' in cp);
      }
    }
  }
});
