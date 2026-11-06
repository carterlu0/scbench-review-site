import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const latest=await load('results/latest.json');
const group=latest.report.groups.find(g=>g.config.model==='deepseek-flash');
const cells=latest.cells.filter(c=>c.model==='deepseek-flash');

test('DeepSeek partial publication retains full denominators and unknown Pipeline totals',()=>{
  assert.equal(cells.length,89);
  assert.equal(cells.filter(c=>c.score!==null).length,88);
  assert.equal(group.publication.scored_trials,88);
  assert.equal(group.primary.sr_cpr.value,58/74);
  for(const name of ['pipeline_fdr','pipeline_cc','pipeline_fc']){
    assert.equal(group.primary[name].value,null);
    assert.equal(group.primary[name].known_units,14);
    assert.equal(group.primary[name].denominator,15);
  }
  const pending=cells.filter(c=>c.status==='running');
  assert.equal(pending.length,1);
  assert.equal(pending[0].problem,'verilog_pcie_t3');
  assert.equal(pending[0].mode,'pipeline');
  assert.equal(pending[0].checkpoints.length,8);
  assert.ok(pending[0].checkpoints.every(cp=>cp.state==='pending'));
});

test('DeepSeek PCIe SR uses the completed retry while running Pipeline has no live evidence',async()=>{
  const detail=await load('results/'+latest.details.verilog_pcie_t3.path);
  const retry=detail.cells.find(c=>c.id==='6a94d4e68770a3feebb3befd1307e101abfe4494f6966997e8c44acd844c04e7');
  assert.equal(retry.selected_attempt,'b53dca3a4a4e475ab8a8e6022b8c9b5b');
  assert.equal(retry.attempt_count,2);
  assert.equal(retry.score,0);
  assert.equal(retry.checkpoints[0].tests.length,86);
  assert.equal(retry.checkpoints[0].tests.filter(t=>t.status==='passed').length,79);
  assert.ok(retry.checkpoints[0].candidate_artifact.path);
  const running=detail.cells.find(c=>c.model==='deepseek-flash'&&c.mode==='pipeline');
  assert.equal(running.selected_attempt,null);
  for(const cp of running.checkpoints){
    assert.equal(cp.publication_placeholder,true);
    assert.equal(cp.candidate,null);
    assert.equal(cp.evaluation_sha256,null);
    assert.equal(cp.inference_sha256,null);
    assert.deepEqual(cp.tests,[]);
  }
});
