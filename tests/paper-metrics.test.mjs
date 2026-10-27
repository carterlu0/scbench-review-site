import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderPaperMetrics,selectPaperGroups,paperCsv} from '../paper-metrics.mjs';

const root=new URL('../data/paper/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const catalog=await load('catalog.json');
const manifest=await load('benchmark-v1.json');
const entry=catalog.reports.find(r=>r.analysis_id===catalog.default_analysis);
const report=await load(entry.path);

test('report hashes, frozen denominators and FDR/CC chain weighting are consistent',async()=>{
  assert.equal(createHash('sha256').update(await readFile(new URL(entry.path,root))).digest('hex'),entry.sha256);
  const records=await load(report.checkpoint_records_path);
  for(const g of report.groups){
    assert.equal(g.primary.pipeline_fdr.denominator,manifest.chains.length);
    assert.equal(g.primary.pipeline_cc.denominator,manifest.chains.length);
    assert.equal(g.primary.sr_cpr.denominator,manifest.chains.reduce((s,c)=>s+c.checkpoints.length,0));
    for(const [name,field] of [['pipeline_fdr','d_j'],['pipeline_cc','q_j']]){
      if(g.chains.every(c=>c[field]!=null)){
        const expected=g.chains.reduce((s,c)=>s+c[field],0)/g.chains.length;
        assert.ok(Math.abs(g.primary[name].raw_value-expected)<1e-12);
      }
    }
    const cps=records.groups.find(r=>r.id===g.id).checkpoint_records;
    for(const cp of cps.filter(r=>r.execution_status==='not_reached')){
      assert.equal(cp.strict_pass,0);assert.equal(cp.groups,null);
      assert.equal(cp.costs.actual.usd,0);assert.equal(cp.agent_elapsed_seconds,0);
    }
    for(const mode of ['pipeline','sr'])for(const policy of ['actual','fixed_85']){
      const r=g.resources[`${mode}_${policy}`];
      if(r.total_cost_usd!=null)assert.ok(Math.abs(r.mean_cost_usd-r.total_cost_usd/r.denominator)<1e-12);
    }
  }
});

test('main metrics are default; auxiliary and resources require explicit selection',()=>{
  const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams());
  assert.match(html,/paper-primary/);assert.doesNotMatch(html,/class="matrix-checkpoints paper-auxiliary"/);
  assert.doesNotMatch(html,/class="matrix-checkpoints paper-resources"/);
  const extra=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('aux=1&overhead=1&cache=fixed_85'));
  assert.match(extra,/class="matrix-checkpoints paper-auxiliary"/);
  assert.match(extra,/class="matrix-checkpoints paper-resources"/);
  assert.match(extra,/value="fixed_85" selected/);
  assert.match(extra,/input\/output tokens/);
});

test('configuration filters never merge efforts, prompts, protocols or repeats',()=>{
  for(const g of report.groups){
    assert.equal(selectPaperGroups({...report,groups:[g]},{model:g.config.model,agent:g.config.agent,prompt_arm:g.config.prompt_arm}).length,1);
    assert.equal(selectPaperGroups({...report,groups:[g]},{model:'not-a-model'}).length,0);
    assert.ok(selectPaperGroups(report,{protocol:g.configuration_bindings[0].protocol}).includes(g));
  }
  const output=paperCsv(report,{scope:'formal'},'fixed_85');
  assert.match(output,/pipeline_fdr/);assert.match(output,/sr_chain_macro/);assert.match(output,/fixed_85/);
  assert.match(output,/raw_value/);assert.match(output,/denominator/);
});

test('explicit applicability is generation bound and backed by frozen source hashes',()=>{
  const evidence=manifest.applicability_evidence;
  for(const chain of manifest.chains)for(const cp of chain.checkpoints)for(const rule of cp.non_applicable_tests||[]){
    assert.ok(rule.generations.length);assert.ok(rule.evidence_ids.length);
    for(const id of rule.evidence_ids){
      const e=evidence[id];assert.ok(rule.generations.includes(e.evaluation_generation));
      for(const source of Object.values(e.sources))assert.equal(createHash('sha256').update(source.text).digest('hex'),source.sha256);
    }
  }
});

test('audited SR target versions unlock complete CPR and preserve timing decisions',async()=>{
  const audited=catalog.reports.find(r=>r.analysis_id===manifest.sr_version_audit.source_analysis_id);
  const report=await load(audited.path);
  const high=report.groups.find(g=>g.config.thinking==='high');
  assert.equal(high.primary.sr_cpr.value,38/74);
  assert.equal(high.primary.sr_cpr.reason,null);
  const records=await load(report.checkpoint_records_path);
  const sr=records.groups.find(g=>g.id===high.id).checkpoint_records.filter(r=>r.mode==='sr');
  assert.equal(sr.length,74);
  assert.ok(sr.every(r=>r.compatible&&r.version_audit_id&&r.target_generation));
  assert.equal(sr.filter(r=>r.original_compatibility.score==='unknown').length,70);
  assert.equal(sr.filter(r=>r.resolved_compatibility.time==='incompatible').length,3);
  assert.equal(high.efficiencies.sr_cpr_actual.time_efficiency_per_hour,null);
  for(const g of report.groups.filter(g=>g.config.thinking!=='high')){
    assert.equal(g.primary.sr_cpr.value,null);
    assert.equal(g.primary.sr_cpr.reason,'incomplete_results');
  }
});
