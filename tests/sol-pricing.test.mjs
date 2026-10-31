import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPaperMetrics} from '../paper-metrics.mjs';

const load=async path=>JSON.parse(await readFile(new URL(`../data/paper/${path}`,import.meta.url),'utf8'));
const catalog=await load('catalog.json');
const report=await load(catalog.reports.find(r=>r.analysis_id===catalog.default_analysis).path);

test('published Sol prices distinguish entire-request context tiers',()=>{
  const rates=report.price_metadata.rates.filter(r=>r.model==='gpt-6.1-sol');
  assert.equal(rates.length,2);
  assert.deepEqual(rates.map(r=>[r.max_context,r.input,r.output,r.cache_read,r.cache_write]),
    [[272000,2,10,0.1,2.5],[null,4,15,0.2,5]]);
  const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('overhead=1'));
  assert.match(html,/prompt input ≤ 272,000 tokens/);
  assert.match(html,/prompt input &gt; 272,000 tokens/);
  assert.match(html,/entire individual request/);
  assert.match(html,/request_context_required/);
});

test('Sol batch uses declared base-tier assumption without fabricating missing usage',async()=>{
  const records=await load(report.checkpoint_records_path);
  const sol=records.groups.find(g=>g.config.model==='gpt-6.1-sol');
  const costs=sol.checkpoint_records.filter(r=>r.execution_status==='executed').flatMap(r=>Object.values(r.costs));
  const priced=costs.filter(c=>c.usd!=null&&!c.imputed);
  assert.ok(priced.length>0);
  assert.ok(priced.every(c=>c.context_tier_basis==='user_declared_request_bound'));
  assert.ok(priced.every(c=>c.rate.input===2&&c.rate.cache_read===0.1));
  assert.ok(costs.every(c=>c.usd!=null));
  assert.equal(costs.filter(c=>c.imputed).length,12);
  assert.ok(costs.filter(c=>c.imputed).every(c=>c.usd===0&&'original_cost' in c));
  assert.ok(costs.some(c=>c.imputed&&c.original_cost.usd>0));
  const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('overhead=1'));
  assert.match(html,/user-declared per-request input bound/);
  assert.match(html,/temporary zero cost records/);
  const g=report.groups.find(g=>g.config.model==='gpt-6.1-sol');
  const e=g.efficiencies.sr_cpr_actual;
  const expected=g.primary.sr_cpr.value/g.resources.sr_actual.mean_cost_usd;
  assert.ok(Math.abs(e.cost_efficiency_per_usd-expected)<1e-12);
  assert.ok(html.includes(expected.toLocaleString('en-US',{maximumFractionDigits:5})));
  assert.equal(g.resources.pipeline_actual.imputed_cost_records,5);
  assert.equal(g.resources.sr_actual.imputed_cost_records,1);
});

test('Sol mean times include recorded failed invocations and zero only uninvoked tail',async()=>{
  const records=await load(report.checkpoint_records_path);
  const sol=records.groups.find(g=>g.config.model==='gpt-6.1-sol');
  const g=report.groups.find(g=>g.config.model==='gpt-6.1-sol');
  const taxi=sol.checkpoint_records.filter(r=>r.chain_id==='taxi_axi_t3');
  assert.equal(taxi.find(r=>r.mode==='pipeline'&&r.checkpoint_id==='checkpoint_1').agent_elapsed_seconds,4291.581326);
  assert.equal(taxi.find(r=>r.mode==='pipeline'&&r.checkpoint_id==='checkpoint_2').agent_elapsed_seconds,7201.48349);
  assert.equal(taxi.find(r=>r.mode==='sr'&&r.checkpoint_id==='checkpoint_1').agent_elapsed_seconds,2941.006189);
  const tail=taxi.filter(r=>r.mode==='pipeline'&&r.checkpoint_index>=3);
  assert.equal(tail.length,3);
  assert.ok(tail.every(r=>r.agent_elapsed_seconds===0&&r.timing_source==='not_invoked_after_recorded_failure'));
  for(const mode of ['pipeline','sr']){
    const resource=g.resources[`${mode}_actual`];
    assert.equal(resource.known_time_records,74);
    assert.ok(resource.mean_time_seconds>0);
    const sum=sol.checkpoint_records.filter(r=>r.mode===mode).reduce((s,r)=>s+r.agent_elapsed_seconds,0);
    assert.ok(Math.abs(resource.mean_time_seconds-sum/(mode==='pipeline'?15:74))<1e-10);
  }
  assert.ok(g.efficiencies.sr_cpr_actual.time_efficiency_per_hour>0);
  const luna=report.groups.find(g=>g.config.model==='gpt-6-luna'&&g.config.thinking==='high');
  assert.equal(luna.efficiencies.sr_cpr_actual.time_efficiency_per_hour,null);
  assert.ok(luna.efficiencies.sr_cpr_actual.observed_time_efficiency_per_hour>0);
  assert.match(renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('overhead=1')),/Observed estimate · timing not comparable/);
});
