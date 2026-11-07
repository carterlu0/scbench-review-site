import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finalResult,testCounts,csv} from '../experiments-core.mjs';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));

test('Kimi publishes 88 completed trials and a running PCIe temporary zero',async()=>{
  const latest=await load('results/latest.json');
  const selected=latest.cells.filter(c=>c.model==='kimi-k3.1-pro');
  assert.equal(selected.length,89);
  assert.equal(selected.filter(c=>c.status==='completed').length,88);
  const cell=selected.find(c=>c.status==='running');
  assert.equal(cell.problem,'verilog_pcie_t3');
  assert.equal(cell.mode,'pipeline');
  assert.equal(cell.score,0);
  assert.equal(cell.score_override.reason,'temporary_user_zero');
  const group=latest.report.groups.find(g=>g.config.model==='kimi-k3.1-pro');
  assert.equal(group.publication.pending_trials,1);
  assert.equal(group.publication.provisional_zero_trials,1);
  assert.deepEqual(Object.values(group.primary).map(m=>m.denominator),[15,15,15,74]);
  assert.ok(Object.values(group.primary).every(m=>m.value!==null));
  const detail=await load('results/'+latest.details.verilog_pcie_t3.path);
  const full=detail.cells.find(c=>c.id===cell.id);
  assert.equal(full.selected_attempt,null);
  assert.equal(full.checkpoints.length,8);
  for(const cp of full.checkpoints){
    assert.equal(cp.state,'pending');
    assert.equal(cp.candidate,null);
    assert.equal(cp.inference_sha256,null);
    assert.equal(cp.evaluation_sha256,null);
    assert.deepEqual(cp.tests,[]);
    assert.deepEqual(testCounts(cp),{passed:0,total:cp.expected_test_counts.total});
  }
  assert.equal(finalResult(full).reason,'temporary_user_zero');
  assert.equal(finalResult(full).passed,0);
  assert.match(csv([full]),/temporary_user_zero/);
  const rows=latest.records.groups.find(g=>g.id===group.id).checkpoint_records.filter(r=>r.cell_id===cell.id);
  assert.equal(rows.length,8);
  for(const row of rows){
    assert.equal(row.strict_pass,0);
    assert.equal(row.reason,'temporary_user_zero');
    assert.equal(row.groups,null);
    assert.equal(row.costs.actual.usd,null);
  }
  const failures=latest.nonpass_units.filter(r=>r.cell_id===cell.id);
  assert.equal(failures.length,8);
  assert.ok(failures.every(r=>r.category==='temporary_user_zero'));
});
