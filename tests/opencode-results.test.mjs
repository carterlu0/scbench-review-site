import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finalResult} from '../experiments-core.mjs';
import {renderLatestStatus,renderPublicationNotes} from '../experiments.mjs';
import {selectPaperGroups} from '../paper-metrics.mjs';

const load=async p=>JSON.parse(await readFile(new URL('../data/'+p,import.meta.url),'utf8'));
const data=await load('results/latest.json');
const publication=await load('experiments/SOL-OPENCODE-HIGH-20261105.json');
const cells=data.cells.filter(c=>c.agent==='opencode');
const group=data.report.groups.find(g=>g.config.agent==='opencode');

test('OpenCode is a distinct setting and retains all planned trial identities',()=>{
  assert.equal(cells.length,89);
  assert.equal(cells.filter(c=>c.mode==='sr').length,74);
  assert.equal(cells.filter(c=>c.mode==='pipeline').length,15);
  assert.ok(cells.every(c=>c.model==='gpt-6.1-sol'&&c.thinking==='high'&&c.agent_version==='1.18.32'));
  assert.equal(selectPaperGroups(data.report,{model:'gpt-6.1-sol',thinking:'high'}).length,2);
  assert.equal(group.source_analysis,publication.analysis_id);
  assert.equal(cells.filter(c=>c.score!==null).length,publication.scored_trials);
});

test('reviewed total-runtime failures score zero without inventing evaluations',async()=>{
  const zeros=cells.filter(c=>c.score_override?.classification==='delivery_timeout');
  assert.deepEqual(zeros.map(c=>c.problem).sort(),['taxi_axi_t3','verilog_axis_fifo_t1']);
  for(const c of zeros){
    assert.equal(c.score,0);
    assert.equal(c.score_override.provisional,false);
    assert.equal(c.score_override.limit_seconds,7200);
    assert.equal(c.checkpoints[0].state,'inference_error');
    assert.equal(finalResult(c,cells).passed,0);
    assert.ok(finalResult(c,cells).total>0);
    const detailed=(await load('results/'+data.details[c.problem].path)).cells.find(x=>x.id===c.id);
    assert.equal(detailed.checkpoints[0].evaluation_sha256,null);
    assert.ok(detailed.checkpoints[0].inference_seconds>=7200);
  }
});

test('pending PCIe remains unscored with the complete benchmark denominator',()=>{
  const pcie=cells.find(c=>c.problem==='verilog_pcie_t3'&&c.mode==='pipeline');
  assert.equal(group.primary.sr_cpr.denominator,74);
  assert.equal(group.primary.sr_cpr.known_units,74);
  assert.equal(group.primary.sr_cpr.value,58/74);
  for(const key of ['pipeline_fdr','pipeline_cc','pipeline_fc'])assert.equal(group.primary[key].denominator,15);
  if(publication.pending_trials){
    assert.equal(publication.scored_trials,88);
    assert.equal(pcie.score,null);
    assert.equal(pcie.status,'running');
    assert.equal(pcie.checkpoints.at(-1).state,'awaiting_evaluation');
    assert.equal(finalResult(pcie,cells).passed,null);
    assert.ok(group.issues.every(i=>i.chain_id==='verilog_pcie_t3'));
    assert.equal(group.primary.pipeline_fdr.value,null);
  }else{
    assert.equal(publication.scored_trials,89);
    assert.deepEqual(group.issues,[]);
    assert.notEqual(pcie.score,null);
  }
  assert.match(renderPublicationNotes(group.publication),/high\+OpenCode/);
  assert.ok(renderLatestStatus(data).includes(`${publication.scored_trials}/89 trials scored`));
});
