import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPublicationNotes, renderLatestStatus} from '../experiments.mjs';
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
    agent_failure:publication.outcomes.delivery_timeout,not_scored:publication.outcomes.unscored_infrastructure});
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
