import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testCounts, finalResult, fraction} from '../experiments-core.mjs';
const override={value:0,reason:'agent_failure',provisional:true};
test('provisional Agent failure counts zero while retaining raw test verdicts',()=>{
 const cp={target_checkpoint:'checkpoint_5',state:'inference_error',score_override:override,tests:[{nodeid:'raw',group:'Core',status:'passed'}],expected_test_counts:{total:12,groups:{core:3,functionality:1,regression:6,structure:2}}};
 const cell={mode:'pipeline',progression_policy:'structure-cases',planned_targets:['checkpoint_5'],score_override:override,checkpoints:[cp],expected_test_counts:{checkpoint_5:cp.expected_test_counts}};
 assert.equal(fraction(finalResult(cell)),'0/12');
 assert.equal(finalResult(cell).reason,'agent_failure');
 assert.deepEqual(testCounts(cp,'core'),{passed:0,total:4});
 assert.deepEqual(testCounts(cp,'regression'),{passed:0,total:6});
 assert.equal(cp.tests[0].status,'passed');
 assert.equal(cp.state,'inference_error');
});

test('default release includes all 89 Sol trials and retains the 356 Luna trials',async()=>{
 const {readFile}=await import('node:fs/promises');
 const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
 const catalog=await load('experiments/catalog.json');
 const release=await load(`experiments/analyses/${catalog.default_analysis}.json`);
 const old=await load(`experiments/analyses/${release.publication.previous_analysis}.json`);
 assert.equal(release.cells.length,445);
 assert.deepEqual(release.cells.slice(0,356),old.cells);
 const sol=release.cells.filter(c=>c.model==='gpt-6.1-sol');
 assert.equal(sol.length,89);
 assert.equal(sol.filter(c=>c.mode==='pipeline').length,15);
 assert.equal(sol.filter(c=>c.mode==='sr').length,74);
 const failures=sol.filter(c=>c.outcome==='agent_failure');
 assert.equal(failures.length,2);
 assert.deepEqual(failures.map(c=>c.mode).sort(),['pipeline','sr']);
 for(const c of failures){assert.equal(c.score,0);assert.equal(c.score_override.provisional,true);assert.equal(c.problem,'taxi_axi_t3');}
 const pipeline=failures.find(c=>c.mode==='pipeline');
 assert.equal(fraction(finalResult(pipeline)),'0/37');
 const report=await load(`paper/reports/${catalog.default_analysis}.json`);
 assert.equal(report.groups.length,5);
 for(const g of report.groups){assert.deepEqual(g.issues,[]);assert.equal(g.coverage.num_chains,15);assert.equal(g.coverage.num_checkpoints,74);for(const metric of Object.values(g.primary))assert.notEqual(metric.value,null);}
 const solGroup=report.groups.find(g=>g.config.model==='gpt-6.1-sol');
 for(const key of ['pipeline_core_pass_rate','sr_core_pass_rate','sr_core_completion','sr_regression_failure_rate']) {
  assert.notEqual(solGroup.auxiliary[key].value,null,key);
  assert.equal(solGroup.auxiliary[key].reason,null,key);
  assert.equal(solGroup.auxiliary[key].known_units,solGroup.auxiliary[key].denominator,key);
 }
});
