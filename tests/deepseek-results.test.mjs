import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPublicationNotes} from '../experiments.mjs';
import {renderPaperMetrics} from '../paper-metrics.mjs';

const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const latest=await load('results/latest.json');
const group=latest.report.groups.find(g=>g.config.model==='deepseek-flash');
const cells=latest.cells.filter(c=>c.model==='deepseek-flash');

test('DeepSeek complete publication scores all planned groups and Pipeline totals',()=>{
  assert.equal(cells.length,89);
  assert.ok(cells.every(c=>c.status==='completed'&&c.score!==null));
  assert.equal(cells.filter(c=>c.outcome==='passed').length,62);
  assert.equal(group.publication.scored_trials,89);
  assert.equal(group.publication.pending_trials,0);
  assert.equal(group.publication.physical_attempts,90);
  assert.deepEqual(group.issues,[]);
  assert.equal(group.primary.sr_cpr.value,58/74);
  assert.equal(group.primary.pipeline_fdr.value,4/15);
  assert.ok(Math.abs(group.primary.pipeline_cc.value-0.4116666666666667)<1e-12);
  assert.ok(Math.abs(group.primary.pipeline_fc.value-0.7199206935792302)<1e-12);
  for(const name of ['pipeline_fdr','pipeline_cc','pipeline_fc']){
    assert.equal(group.primary[name].known_units,15);
    assert.equal(group.primary[name].denominator,15);
  }
});

test('DeepSeek PCIe retains the authorized SR retry and publishes final Pipeline evidence',async()=>{
  const detail=await load('results/'+latest.details.verilog_pcie_t3.path);
  const retry=detail.cells.find(c=>c.id==='6a94d4e68770a3feebb3befd1307e101abfe4494f6966997e8c44acd844c04e7');
  assert.equal(retry.selected_attempt,'b53dca3a4a4e475ab8a8e6022b8c9b5b');
  assert.equal(retry.attempt_count,2);
  assert.equal(retry.score,0);
  assert.equal(retry.checkpoints[0].tests.length,86);
  assert.equal(retry.checkpoints[0].tests.filter(t=>t.status==='passed').length,79);
  assert.ok(retry.checkpoints[0].candidate_artifact.path);
  const final=detail.cells.find(c=>c.model==='deepseek-flash'&&c.mode==='pipeline');
  assert.equal(final.selected_attempt,'4536832e2eb94bcdbb00adf6d6c143f3');
  assert.equal(final.attempt_count,1);
  assert.equal(final.score,1/8);
  assert.deepEqual(final.checkpoints.map(cp=>cp.state),['passed',...Array(7).fill('failed')]);
  assert.deepEqual(final.checkpoints.map(cp=>cp.tests.length),[35,21,86,118,86,121,122,133]);
  for(const cp of final.checkpoints){
    assert.ok(cp.candidate&&cp.candidate_artifact.path);
    assert.ok(cp.evaluation_sha256&&cp.inference_sha256);
    assert.ok(!cp.publication_placeholder);
  }
});

test('DeepSeek partial snapshot remains independently available and unscored',async()=>{
  const receipt=await load('experiments/DEEPSEEK-OPENCODE-HIGH-PARTIAL-20261106.json');
  const catalog=await load('experiments/catalog.json');
  const entry=catalog.releases.find(r=>r.id===receipt.analysis_id);
  const analysis=await load('experiments/'+entry.path);
  assert.equal(analysis.publication.scored_trials,88);
  const detail=await load('experiments/'+analysis.detail_paths.verilog_pcie_t3);
  const pending=detail.cells.find(c=>c.mode==='pipeline');
  assert.equal(pending.status,'running');
  assert.equal(pending.selected_attempt,null);
  assert.equal(pending.score,null);
  assert.ok(pending.checkpoints.every(cp=>cp.publication_placeholder&&cp.state==='pending'&&!cp.candidate));
  assert.notEqual(receipt.analysis_id,group.source_analysis);
});

test('DeepSeek peak estimate includes separately recorded reasoning and preserves raw tokens',async()=>{
  const rate=latest.report.price_metadata.rates.find(r=>r.model==='deepseek-flash');
  assert.deepEqual([rate.input,rate.output,rate.cache_read],[0.30,1.20,0.006]);
  assert.equal(rate.output_token_semantics,'exclusive_reasoning');
  const detail=await load('results/'+latest.details.verilog_pcie_t3.path);
  const final=detail.cells.find(c=>c.model==='deepseek-flash'&&c.mode==='pipeline');
  const cp=final.checkpoints.at(-1);
  assert.equal(cp.tokens.output,15329);
  assert.equal(cp.tokens.reasoning,36177);
  assert.equal(cp.costs.actual.billed_tokens.output,51506);
  assert.ok(Math.abs(cp.costs.actual.usd-(105786*.30+7891200*.006+51506*1.20)/1e6)<1e-12);
  for(const mode of ['pipeline','sr']){
    const resource=group.resources[mode+'_actual'];
    assert.equal(resource.known_cost_records,74);
    assert.ok(resource.total_cost_usd>0);
    assert.deepEqual(resource.cost_missing_reasons,{});
  }
  const note=renderPublicationNotes(group.publication,latest.report.price_metadata);
  assert.match(note,/peak prices/);
  assert.doesNotMatch(note,/pricing remains pending/);
  assert.match(renderPaperMetrics(latest.report,{model:'deepseek-flash'},new URLSearchParams()),/\$0\.006/);
});
