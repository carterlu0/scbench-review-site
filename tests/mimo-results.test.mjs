import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPublicationNotes, renderLatestStatus} from '../experiments.mjs';
import {renderPaperMetrics, simulateThresholdGroup} from '../paper-metrics.mjs';
const load=async p=>JSON.parse(await readFile(new URL('../data/'+p,import.meta.url),'utf8'));
const data=await load('results/latest.json');
const publication=await load('experiments/MIMO-OPENCODE-HIGH-20261105.json');
const cells=data.cells.filter(c=>c.model==='mimo-v2.6-pro'&&c.agent==='opencode');
const group=data.report.groups.find(g=>g.config.model==='mimo-v2.6-pro');
const task=c=>[c.problem,c.mode,...(c.mode==='sr'?c.planned_targets:[])].join(':');

test('MiMo publishes every planned group with counts bound to its final receipt',()=>{
  assert.equal(cells.length,89);
  assert.equal(cells.filter(c=>c.mode==='pipeline').length,15);
  assert.equal(cells.filter(c=>c.mode==='sr').length,74);
  assert.ok(cells.every(c=>c.thinking==='high'&&c.agent_version==='1.18.32'));
  assert.equal(cells.filter(c=>c.score!==null).length,publication.scored_trials);
  const outcomes={};
  for(const c of cells)outcomes[c.outcome]=(outcomes[c.outcome]||0)+1;
  assert.deepEqual(outcomes,{passed:publication.outcomes.passed,failed:publication.outcomes.failed,
    agent_failure:publication.outcomes.delivery_timeout+(publication.outcomes.incomplete_delivery||0)});
  assert.equal(publication.scored_trials+publication.pending_trials,89);
  assert.ok(publication.physical_attempts>=104);
  assert.equal(publication.max_parallel,8);
  assert.equal(group.source_analysis,publication.analysis_id);
  assert.deepEqual(publication.native_thinking,{type:'enabled'});
  assert.equal(publication.provider,'agicto');
  assert.equal(group.configuration_bindings.length,89);
  assert.deepEqual(Object.values(group.primary).map(m=>m.denominator),[15,15,15,74]);
  assert.match(renderPublicationNotes(group.publication),new RegExp(`${publication.scored_trials}\\/89 trials scored`));
  assert.match(renderLatestStatus(data),new RegExp(`${publication.scored_trials}\\/89 trials scored`));
});

test('infra errors stay unknown and never appear as model nonpass outcomes',()=>{
  const unresolved=cells.filter(c=>c.score===null);
  assert.deepEqual(unresolved.map(task).sort(),publication.pending.map(p=>p.task).sort());
  const pendingIds=new Set(unresolved.map(c=>c.id));
  assert.ok(unresolved.every(c=>c.status==='infra_failed'&&!c.score_override));
  assert.ok(!data.nonpass_units.some(r=>pendingIds.has(r.cell_id)));
  const status=data.group_status.find(s=>s.model==='mimo-v2.6-pro');
  assert.equal(status.pending>0,publication.pending_trials>0);
  assert.equal(status.planned,148);
  assert.equal(status.scored_trials,publication.scored_trials);
  assert.ok(publication.pending.every(p=>p.physical_attempts>=2&&p.score===null));
  const records=data.records.groups.find(g=>g.id===group.id).checkpoint_records;
  assert.ok(records.filter(r=>pendingIds.has(r.cell_id)).every(r=>r.strict_pass===null));
});

test('final MiMo ruling resolves every score without replacing raw infrastructure evidence',async()=>{
  assert.equal(publication.scored_trials,89);
  assert.equal(publication.pending_trials,0);
  assert.equal(publication.adjudicated_infrastructure.length,1);
  const cell=cells.find(c=>task(c)==='register_interface_t1:pipeline');
  assert.equal(cell.status,'infra_failed');
  assert.equal(cell.score,0);
  assert.equal(cell.score_override.classification,'incomplete_delivery');
  const detail=(await load('results/'+data.details[cell.problem].path)).cells.find(c=>c.id===cell.id);
  assert.equal(detail.checkpoints[0].state,'inference_error');
  assert.equal(detail.infrastructure_failure.category,'connection_reset');
  assert.deepEqual(group.issues,[]);
  assert.ok(Object.values(group.primary).every(m=>m.value!==null&&m.known_units===m.denominator));
  assert.ok(Object.values(group.auxiliary).every(m=>m.value!==null));
  assert.ok(Math.abs(group.primary.pipeline_fdr.value-1/15)<1e-12);
  assert.ok(Math.abs(group.primary.pipeline_cc.value-1.8666666666666667/15)<1e-12);
  assert.ok(Math.abs(group.primary.pipeline_fc.value-1.9583333333333333/15)<1e-12);
  const records=data.records.groups.find(g=>g.id===group.id);
  const simulated=simulateThresholdGroup(group,records);
  for(const k of ['pipeline_fdr','pipeline_cc','pipeline_fc'])assert.ok(Math.abs(simulated[k].value-group.primary[k].value)<1e-12);
  const html=renderPaperMetrics(data.report,{model:'mimo-v2.6-pro'},new URLSearchParams('extra=1'),data.records);
  const primary=html.match(/<table[^>]*paper-primary[\s\S]*?<\/table>/)?.[0];
  assert.ok(primary);
  assert.doesNotMatch(primary,/N\/A/);
  for(const resource of Object.values(group.resources)){
    assert.equal(resource.known_cost_records,resource.expected_cost_records);
    assert.ok(resource.total_cost_usd>0);
    assert.ok(resource.total_time_seconds>0);
  }
});

test('all terminal timeouts score zero while retaining original execution evidence',async()=>{
  const zeros=cells.filter(c=>c.score_override?.classification==='delivery_timeout');
  assert.equal(zeros.length,publication.outcomes.delivery_timeout);
  for(const c of zeros){
    assert.equal(c.score,0);
    assert.equal(c.score_override.provisional,false);
    assert.equal(c.score_override.limit_seconds,7200);
    const detailed=(await load('results/'+data.details[c.problem].path)).cells.find(x=>x.id===c.id);
    const timed=detailed.checkpoints.filter(cp=>cp.state==='inference_error'&&cp.execution_diagnosis==='timeout');
    assert.equal(timed.length,1);
    assert.ok(timed[0].inference_seconds>=7200);
    assert.equal(timed[0].evaluation_sha256,null);
    assert.ok(timed[0].candidate_artifact?.sha256);
    assert.ok(detailed.checkpoints.every(cp=>cp.score_override.value===0));
  }
});

test('MiMo uses the provided Agicto prices and retains downloadable candidates',async()=>{
  assert.ok(publication.candidate_archives>80);
  for(const mode of ['pipeline','sr'])for(const policy of ['actual','fixed_85']){
    const resource=group.resources[`${mode}_${policy}`];
    assert.ok(resource.known_cost_records>0);
    assert.ok(resource.known_cost_records<=resource.expected_cost_records);
    if(resource.total_cost_usd!==null)assert.ok(resource.total_cost_usd>0);
  }
  for(const c of cells.filter(c=>c.score===null)){
    const detailed=(await load('results/'+data.details[c.problem].path)).cells.find(x=>x.id===c.id);
    assert.ok(detailed.checkpoints.some(cp=>cp.candidate_artifact?.sha256));
    assert.equal(detailed.score,null);
  }
});
