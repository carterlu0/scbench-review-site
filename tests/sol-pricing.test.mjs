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
  const priced=costs.filter(c=>c.usd!=null);
  assert.ok(priced.length>0);
  assert.ok(priced.every(c=>c.context_tier_basis==='user_declared_request_bound'));
  assert.ok(priced.every(c=>c.rate.input===2&&c.rate.cache_read===0.1));
  assert.ok(costs.some(c=>c.usd==null&&c.reason==='not_scheduled'));
  const html=renderPaperMetrics(report,{scope:'formal'},new URLSearchParams('overhead=1'));
  assert.match(html,/user-declared per-request input bound/);
  assert.match(html,/USD known subtotal · incomplete/);
});
