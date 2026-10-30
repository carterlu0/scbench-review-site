import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderPaperMetrics,selectPaperGroups,paperCsv,simulateThresholdGroup,pipelineCheckpointPassRate} from '../paper-metrics.mjs';

const root=new URL('../data/paper/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const catalog=await load('catalog.json');
const manifest=await load('benchmark-v1.json');
// Historical numerical regressions remain pinned when the default advances.
const entry=catalog.reports.find(r=>r.analysis_id==='6dc6f954869bfb493fd6889fe9a933fc2d3268c22e87a8b7cfea76f67c9e85c1');
const report=await load(entry.path);

test('report hashes, frozen denominators and FDR/CC chain weighting are consistent',async()=>{
  assert.equal(createHash('sha256').update(await readFile(new URL(entry.path,root))).digest('hex'),entry.sha256);
  const records=await load(report.checkpoint_records_path);
  for(const g of report.groups){
    assert.equal(g.primary.pipeline_fdr.denominator,manifest.chains.length);
    assert.equal(g.primary.pipeline_cc.denominator,manifest.chains.length);
    assert.equal(g.primary.sr_cpr.denominator,manifest.chains.reduce((s,c)=>s+c.checkpoints.length,0));
    for(const [name,field] of [['pipeline_fdr','d_j'],['pipeline_cc','q_j'],['pipeline_fc','f_j']]){
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
  assert.match(html,/<th>FC<small>Pipeline Final Completion/);
  assert.match(html,/data-paper-select="threshold"/);assert.match(html,/Structure-case \(recorded\)/);
  assert.doesNotMatch(html,/class="matrix-checkpoints paper-resources"/);
  const extra=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('aux=1&overhead=1&cache=fixed_85'));
  assert.match(extra,/class="matrix-checkpoints paper-auxiliary"/);
  assert.match(extra,/class="matrix-checkpoints paper-resources"/);
  assert.match(extra,/value="fixed_85" selected/);
  assert.match(extra,/input\/output tokens/);
});

test('core-case and strict-case simulations reuse recorded rows and change only pipeline FDR/CC/FC',async()=>{
  const records=await load(report.checkpoint_records_path);
  for(const g of report.groups.filter(g=>['high','medium'].includes(g.config.thinking))){
    const rg=records.groups.find(item=>item.id===g.id);
    const structure=simulateThresholdGroup(g,rg,'structure-case');
    assert.ok(Math.abs(structure.pipeline_fdr.value-g.primary.pipeline_fdr.value)<1e-12);
    assert.ok(Math.abs(structure.pipeline_cc.value-g.primary.pipeline_cc.value)<1e-12);
    assert.ok(Math.abs(structure.pipeline_fc.value-g.primary.pipeline_fc.value)<1e-12);
    for(const threshold of ['core-case','strict-case']){
      const simulated=simulateThresholdGroup(g,rg,threshold);
      for(const key of ['pipeline_fdr','pipeline_cc','pipeline_fc']){
        assert.equal(simulated[key].denominator,g.primary[key].denominator);
        assert.equal(simulated[key].known_units,g.primary[key].known_units);
      }
      assert.equal(simulated.threshold,threshold);
    }
    const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('threshold=core-case'),records);
    assert.match(html,/Core-case \(simulated\)/);assert.match(html,/simulations over those same checkpoint results/);
  }
});

test('Pipeline CPR auxiliary metric treats planned Pipeline checkpoints as independent units',async()=>{
  const records=await load(report.checkpoint_records_path);
  const high=report.groups.find(g=>g.config.thinking==='high');
  const value=pipelineCheckpointPassRate(high,records.groups.find(g=>g.id===high.id));
  assert.equal(value.unit,'checkpoint');
  assert.equal(value.denominator,74);
  assert.equal(value.known_units,74);
  assert.ok(Math.abs(value.value-17/74)<1e-12);
  const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('aux=1'),records);
  assert.match(html,/Pipeline CPR \(checkpoint mean\)/);
  const csv=paperCsv(report,{scope:'formal'},'actual','structure-case',records);
  assert.match(csv,/pipeline_cpr/);
});

test('configuration filters never merge efforts, prompts, protocols or repeats',()=>{
  for(const g of report.groups){
    assert.equal(selectPaperGroups({...report,groups:[g]},{model:g.config.model,agent:g.config.agent,prompt_arm:g.config.prompt_arm}).length,1);
    assert.equal(selectPaperGroups({...report,groups:[g]},{model:'not-a-model'}).length,0);
    assert.ok(selectPaperGroups(report,{protocol:g.configuration_bindings[0].protocol}).includes(g));
  }
  const output=paperCsv(report,{scope:'formal'},'fixed_85');
  assert.match(output,/pipeline_fdr/);assert.match(output,/pipeline_fc/);assert.match(output,/sr_chain_macro/);assert.match(output,/fixed_85/);
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

test('current Medium data forms one complete group with exact protocol equivalence',async()=>{
  const current=catalog.reports.find(r=>r.analysis_id==='5667349f28caf00f99155395112bb70f856d5d5a3e0a24ec1c07ea6a5a155bf7');
  const report=await load(current.path);
  const medium=report.groups.filter(g=>g.config.thinking==='medium');
  assert.equal(medium.length,1);
  const g=medium[0];
  assert.equal(g.primary.pipeline_fdr.value,0);
  assert.ok(Math.abs(g.primary.pipeline_cc.value-0.1411111111111111)<1e-12);
  assert.equal(g.primary.sr_cpr.value,28/74);
  assert.equal(g.primary.pipeline_fdr.known_units,15);
  assert.equal(g.primary.sr_cpr.known_units,74);
  assert.deepEqual(g.issues,[]);
  assert.equal(g.configuration_bindings.length,89);
  assert.equal(new Set(g.configuration_bindings.map(b=>b.protocol)).size,2);
  const records=await load(report.checkpoint_records_path);
  const cps=records.groups.find(r=>r.id===g.id).checkpoint_records;
  const clint=cps.filter(r=>r.chain_id==='clint_t1'&&r.mode==='pipeline');
  assert.deepEqual(clint.map(r=>r.strict_pass),[1,1,1,0]);
  for(const metric of Object.values(g.primary))assert.equal(metric.reason,null);
  for(const proto of new Set(g.configuration_bindings.map(b=>b.protocol))){
    assert.equal(manifest.protocol_equivalence[proto].config_id,g.config.protocol);
  }
});

test('FC uses preset final Core and Regression counts and zero for unreached finals',async()=>{
  const records=await load(report.checkpoint_records_path);
  for(const group of report.groups){
    const cps=records.groups.find(g=>g.id===group.id).checkpoint_records;
    for(const chain of group.chains){
      const final=cps.find(r=>r.chain_id===chain.chain_id&&r.mode==='pipeline'&&r.checkpoint_id===chain.final_checkpoint_id);
      if(final.execution_status==='not_reached')assert.equal(chain.f_j,0);
      else if(final.execution_status==='executed'&&final.groups){
        const {structure,core,regression}=final.groups;
        assert.equal(chain.f_j,structure.all_passed?(core.passed+regression.passed)/(core.expected+regression.expected):0);
      }
    }
  }
  const high=report.groups.find(g=>g.config.thinking==='high');
  const medium=report.groups.find(g=>g.config.thinking==='medium');
  assert.ok(Math.abs(high.primary.pipeline_fc.value-0.5148513619998152)<1e-12);
  assert.ok(Math.abs(medium.primary.pipeline_fc.value-0.309702176284891)<1e-12);
  assert.equal(high.efficiencies.pipeline_fc_actual.performance,high.primary.pipeline_fc.value);
});

test('formal groups merge Functionality into Core and retain source provenance',async()=>{
  // The immutable pre-retest release still carries the original Functionality
  // nodes. The new evaluator projects them to Core before exporting evidence.
  const historical=await load('reports/5667349f28caf00f99155395112bb70f856d5d5a3e0a24ec1c07ea6a5a155bf7.json');
  const records=await load(historical.checkpoint_records_path);
  assert.deepEqual(historical.policies.test_group_aliases,{Functionality:'Core'});
  for(const g of records.groups){
    for(const cp of g.checkpoint_records){
      if(!cp.groups)continue;
      assert.equal(cp.groups.functionality,undefined);
      for(const t of cp.groups.core.tests||[]){
        assert.equal(t.group.toLowerCase(),'core');
      }
    }
    if(!['high','medium'].includes(g.config.thinking))continue;
    const axis=g.checkpoint_records.find(cp=>cp.mode==='pipeline'&&cp.chain_id==='verilog_axis_fifo_t2');
    assert.equal(axis.groups.core.passed,18);
    assert.equal(axis.groups.core.expected,19);
    const fault=axis.groups.core.tests.find(t=>t.source_group==='Functionality');
    assert.equal(fault.status,'failed');
  }
});

test('historical FC retest retains its own manifest, complete formal scores and repaired Core tests',async()=>{
  const report=await load('reports/9dca9ae8f31e4de703f75339ed078a093bf0fe159b1435307f0d16d26300ddb0.json');
  assert.equal(report.retest.completed_jobs,4);
  assert.equal(report.retest.total_jobs,4);
  assert.equal(report.retest.agent_invocations,0);
  const latestManifest=await load(report.benchmark_manifest_path);
  assert.equal(latestManifest.chains.length,15);
  assert.equal(latestManifest.chains.reduce((n,c)=>n+c.checkpoints.length,0),74);
  assert.notEqual(report.manifest_sha256,catalog.manifest_sha256);
  assert.equal(latestManifest.fc_test_policy_version,'evortl-fc-contract-20261028-v3');
  const records=await load(report.checkpoint_records_path);
  for(const effort of ['high','medium']){
    const group=report.groups.find(g=>g.config.thinking===effort);
    assert.deepEqual(group.issues,[]);
    for(const metric of Object.values(group.primary))assert.equal(metric.reason,null);
    assert.equal(group.primary.sr_cpr.known_units,74);
    assert.equal(group.primary.pipeline_fc.known_units,15);
    const nodes=records.groups.find(g=>g.id===group.id).checkpoint_records;
    const axis=nodes.find(cp=>cp.chain_id==='verilog_axis_fifo_t2'&&cp.mode==='pipeline');
    assert.equal(axis.groups.core.expected,23);
    assert.equal(axis.groups.core.passed,effort==='high'?17:18);
    assert.equal(axis.groups.regression.expected,1);
    assert.ok(axis.groups.core.tests.some(t=>t.nodeid==='test_checkpoint_1_oracle_checks_source_pause'&&t.status==='failed'));
    assert.equal(axis.groups.core.tests.filter(t=>t.nodeid.startsWith('test_checkpoint_1_oracle_checks_status_pulse_width')&&t.status==='failed').length,3);
    assert.equal(axis.groups.functionality,undefined);
  }
  const medium=report.groups.find(g=>g.config.thinking==='medium');
  const clint=medium.chains.find(c=>c.chain_id==='clint_t1');
  assert.equal(clint.q_j,0.75);
  assert.equal(clint.f_j,0);
  for(const g of report.groups.filter(g=>['low','xhigh'].includes(g.config.thinking))){
    assert.equal(g.primary.pipeline_fc.value,null);
    assert.equal(g.primary.pipeline_fc.reason,'incomplete_results');
  }
});

test('residual FC release excludes structural credit and duplicate positives and includes runner errors',async()=>{
  const report=await load('reports/9dca9ae8f31e4de703f75339ed078a093bf0fe159b1435307f0d16d26300ddb0.json');
  assert.equal(report.retest.version,'fc-retest-v3');
  assert.equal(report.retest.derived_cells,34);
  const records=await load(report.checkpoint_records_path);
  for(const effort of ['high','medium']){
    const group=report.groups.find(g=>g.config.thinking===effort);
    const nodes=records.groups.find(g=>g.id===group.id).checkpoint_records;
    const final=chain=>nodes.filter(c=>c.mode==='pipeline'&&c.chain_id===chain).at(-1);
    const ethernet=final('verilog_ethernet_t2');
    assert.equal(ethernet.groups.core.expected+ethernet.groups.regression.expected,22);
    const counted=[...ethernet.groups.core.tests,...ethernet.groups.regression.tests];
    assert.equal(counted.filter(t=>t.nodeid.endsWith('candidate_tb_passes_trusted_target')).length,1);
    assert.ok(counted.every(t=>!t.nodeid.includes('entrypoint_')));
    assert.equal(group.chains.find(c=>c.chain_id==='verilog_ethernet_t2').f_j,15/22);
    const mipi=final('mipi_dphy_t2');
    assert.equal(mipi.groups.core.expected+mipi.groups.regression.expected,69);
    assert.equal(mipi.groups.regression.tests.filter(t=>t.nodeid.includes('rejects_invalid_focused_selection')).length,3);
    assert.equal(mipi.groups.error.tests.filter(t=>t.nodeid.includes('rejects_invalid_focused_selection')).length,0);
  }
  const medium=records.groups.find(g=>g.config.thinking==='medium');
  const taxi=medium.checkpoint_records.find(c=>c.mode==='pipeline'&&c.chain_id==='taxi_axi_t3'&&c.checkpoint_id==='checkpoint_5');
  assert.equal(taxi.groups.structure.expected,5);
  assert.equal(taxi.groups.regression.expected,27);
  assert.ok(taxi.groups.regression.tests.every(t=>!t.nodeid.endsWith('core_structure')));
});
