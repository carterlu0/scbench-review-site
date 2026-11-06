import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {selectPaperGroups, simulateThresholdGroup} from '../paper-metrics.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const data=await load('results/latest.json');
const publication=await load('experiments/LUNA-OPENCODE-HIGH-20261106.json');
const cells=data.cells.filter(c=>c.model==='gpt-6-luna'&&c.agent==='opencode');
const group=data.report.groups.find(g=>g.config.model==='gpt-6-luna'&&g.config.agent==='opencode');

test('Luna OpenCode retains all 89 completed trials and remains distinct from Codex',()=>{
  assert.equal(cells.length,89);
  assert.equal(cells.filter(c=>c.mode==='pipeline').length,15);
  assert.equal(cells.filter(c=>c.mode==='sr').length,74);
  assert.ok(cells.every(c=>c.thinking==='high'&&c.agent_version==='1.18.32'&&c.status==='completed'&&c.score!==null));
  assert.equal(new Set(cells.map(c=>[c.problem,c.mode,...(c.mode==='sr'?c.planned_targets:[])].join(':'))).size,89);
  assert.deepEqual(publication.outcomes,{failed:47,passed:42});
  assert.equal(publication.scored_trials,89);
  assert.equal(publication.pending_trials,0);
  assert.equal(publication.physical_attempts,89);
  assert.equal(publication.checkpoint_inventories,148);
  assert.equal(group.source_analysis,publication.analysis_id);
  assert.equal(group.configuration_bindings.length,89);
  assert.equal(selectPaperGroups(data.report,{model:'gpt-6-luna',thinking:'high'}).length,2);
  assert.equal(cells.filter(c=>c.mode==='sr'&&c.score===1).length,41);
  assert.deepEqual(cells.filter(c=>c.mode==='pipeline'&&c.outcome==='passed').map(c=>c.problem),['clic_t2']);
});

test('Luna paper metrics retain all planned denominators and explicit stops',()=>{
  assert.deepEqual(group.issues,[]);
  assert.deepEqual(Object.values(group.primary).map(m=>m.denominator),[15,15,15,74]);
  assert.equal(group.primary.sr_cpr.value,41/74);
  assert.ok(Math.abs(group.primary.pipeline_cc.value-0.26)<1e-12);
  assert.ok(Object.values(group.primary).every(m=>m.value!==null&&m.known_units===m.denominator));
  const records=data.records.groups.find(g=>g.id===group.id);
  assert.equal(records.checkpoint_records.length,148);
  const stopped=cells.flatMap(c=>c.checkpoints.filter(cp=>cp.state==='stopped_by_policy'));
  assert.equal(stopped.length,8);
  const simulated=simulateThresholdGroup(group,records);
  for(const key of ['pipeline_fdr','pipeline_cc','pipeline_fc'])assert.ok(Math.abs(simulated[key].value-group.primary[key].value)<1e-12);
});

test('Luna details expose immutable code archives and the UART delivery failure',async()=>{
  let candidates=0;
  let uart;
  for(const [problem,detail] of Object.entries(data.details)){
    const raw=await readFile(new URL('../data/results/'+detail.path,import.meta.url));
    assert.equal(createHash('sha256').update(raw).digest('hex'),detail.sha256);
    for(const c of JSON.parse(raw).cells.filter(c=>c.model==='gpt-6-luna'&&c.agent==='opencode')){
      assert.equal(c.attempt_count,1);
      if(problem==='ef_uart_t1'&&c.mode==='pipeline')uart=c;
      for(const cp of c.checkpoints){
        if(!cp.candidate)continue;
        assert.match(cp.candidate_artifact.path,/^experiments\/artifacts\/[a-f0-9]{64}\.tar\.gz$/);
        assert.ok(cp.candidate_artifact.size_bytes>0);
        candidates++;
      }
    }
  }
  assert.equal(candidates,140);
  assert.equal(publication.candidate_archives,139);
  assert.match(uart.checkpoints[0].candidate_failure_reason,/missing required entrypoint build_checkpoint.sh/);
  assert.ok(uart.checkpoints.slice(1).every(cp=>cp.state==='stopped_by_policy'));
});
