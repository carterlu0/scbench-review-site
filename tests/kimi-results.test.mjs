import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finalResult,testCounts,csv} from '../experiments-core.mjs';
import {renderPublicationNotes} from '../experiments.mjs';
import {renderPaperMetrics} from '../paper-metrics.mjs';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));

test('Kimi terminal release keeps user CNY conversion and selected usage costs',async()=>{
  const latest=await load('results/latest.json');
  const group=latest.report.groups.find(g=>g.config.model==='kimi-k3.1-pro');
  const notes=renderPublicationNotes(group.publication,latest.report.price_metadata);
  assert.match(notes,/USD\/CNY reference rate/);
  assert.match(notes,/cache writes \(5 min\)/);
  assert.match(notes,/selected PCIe checkpoints 2–4/);
  assert.doesNotMatch(notes,/pricing is pending|unfinished PCIe cost remains unknown/);
  const html=renderPaperMetrics(latest.report,{model:'kimi-k3.1-pro'},new URLSearchParams('overhead=1'));
  assert.match(html,/\$1\.944345/);
  assert.match(html,/\$10\.17042/);
  assert.match(html,/\$0\.194435/);
});

test('Kimi checkpoint 4 delivery failure preserves earlier test verdicts and evidence',async()=>{
  const latest=await load('results/latest.json');
  const selected=latest.cells.filter(c=>c.model==='kimi-k3.1-pro');
  assert.equal(selected.length,89);
  assert.ok(selected.every(c=>c.status==='completed'));
  const cell=selected.find(c=>c.problem==='verilog_pcie_t3'&&c.mode==='pipeline');
  assert.equal(cell.score,1/8);
  assert.equal(cell.score_override,undefined);
  const group=latest.report.groups.find(g=>g.config.model==='kimi-k3.1-pro');
  assert.equal(group.publication.pending_trials,0);
  assert.equal(group.publication.terminal_delivery_failure_trials,1);
  assert.deepEqual(Object.values(group.primary).map(m=>m.denominator),[15,15,15,74]);
  assert.equal(group.primary.pipeline_fdr.value,.2);
  assert.equal(group.primary.pipeline_cc.value,.3433333333333333);
  assert.equal(group.primary.sr_cpr.value,55/74);
  const detail=await load('results/'+latest.details.verilog_pcie_t3.path);
  const full=detail.cells.find(c=>c.id===cell.id);
  assert.equal(full.selected_attempt,'d6f5eaca94ae4b79884d9f14f8ac5b90');
  assert.equal(full.terminal_delivery_ruling.failed_checkpoint,'checkpoint_4');
  const [cp2,cp3,cp4,...tail]=full.checkpoints;
  assert.deepEqual(testCounts(cp2),{passed:35,total:35});
  assert.deepEqual(testCounts(cp3),{passed:12,total:21});
  assert.deepEqual(testCounts(cp3,'core'),{passed:1,total:5});
  assert.deepEqual(testCounts(cp3,'regression'),{passed:10,total:15});
  assert.equal(cp2.state,'passed');
  assert.equal(cp3.state,'failed');
  assert.equal(cp4.state,'failed');
  assert.equal(cp4.candidate_failure,'delivery_failure');
  assert.equal(cp4.raw_execution_state,'inference_error');
  for(const cp of [cp2,cp3,cp4]){
    assert.match(cp.candidate,/^[a-f0-9]{64}$/);
    assert.match(cp.inference_sha256,/^[a-f0-9]{64}$/);
    assert.match(cp.evaluation_sha256,/^[a-f0-9]{64}$/);
    assert.ok(cp.candidate_artifact.path);
    assert.ok(cp.official_cost.usd>0);
  }
  assert.equal(tail.length,5);
  for(const cp of tail){
    assert.equal(cp.state,'stopped_by_policy');
    assert.equal(cp.raw_execution_state,'missing');
    assert.equal(cp.candidate,null);
    assert.deepEqual(cp.tests,[]);
    assert.equal(cp.official_cost.usd,0);
  }
  assert.equal(finalResult(full).reason,'delivery_failure');
  assert.equal(finalResult(full).passed,0);
  assert.match(csv([full]),/delivery_failure/);
  const rows=latest.records.groups.find(g=>g.id===group.id).checkpoint_records.filter(r=>r.cell_id===cell.id);
  assert.deepEqual(rows.map(r=>r.strict_pass),[1,0,0,0,0,0,0,0]);
  assert.equal(rows[2].reason,'delivery_failure');
  assert.ok(rows.slice(3).every(r=>r.execution_status==='not_reached'&&r.costs.actual.usd===0));
  const failures=latest.nonpass_units.filter(r=>r.cell_id===cell.id);
  assert.equal(failures.length,2);
  assert.equal(failures.find(r=>r.target_checkpoint==='checkpoint_4')?.category,'agent_failure');
});
