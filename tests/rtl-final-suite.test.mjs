import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderFinalSuiteSummary} from '../experiments.mjs?v=20261103-final-suite';
import {finalResult} from '../experiments-core.mjs';

const categories=['build_error','missing_implementation','interface_mismatch','implementation_error','agent_failure'];

function report() {
  return {
    suite_release_id:'a'.repeat(64),
    complete:true,
    uniform_suite_verified:true,
    totals:{planned_units:740,passed:10,nonpassed:5,policy_stopped:725,pending:0},
    category_counts:Object.fromEntries(categories.map(key=>[key,1])),
    observed_nonpass_attempts:[],
    unselected_nonpass_attempt_count:0,
    nonpass_units:categories.map((actual_category,index)=>({
      planned_unit_id:`slot-${index}`,cell_id:`cell-${index}`,model:'model',effort:'low',
      problem:'example',mode:'sr',target_checkpoint:'checkpoint_1',actual_category,
      actual_subtype:'test_failure',inherited_failure:false,
    })),
  };
}

test('final-suite distribution renders every categorized nonpass slot exactly once',()=>{
  const html=renderFinalSuiteSummary(report());
  assert.match(html,/All selected nonpass slots/);
  assert.match(html,/All 5 nonpass slots/);
  for(const category of categories) assert.match(html,new RegExp(`failure-${category}`));
  for(let i=0;i<5;i++) assert.match(html,new RegExp(`slot-${i}`));
});

test('final-suite distribution is withheld when slot counts do not conserve',()=>{
  const summary=report();
  summary.category_counts.agent_failure=0;
  assert.match(renderFinalSuiteSummary(summary),/failed its count check and is withheld/);
  assert.doesNotMatch(renderFinalSuiteSummary(summary),/matrix-final-suite-chart/);
});

test('partial distribution shows all terminal failures and discloses pending slots',()=>{
  const summary=report();
  summary.complete=false;
  summary.totals.pending=1;
  summary.totals.policy_stopped=724;
  const html=renderFinalSuiteSummary(summary);
  assert.match(html,/Provisional · 1 pending/);
  assert.match(html,/5 nonpass slots/);
  assert.match(html,/matrix-final-suite-chart/);
  assert.match(html,/pending slots are excluded from the nonpass denominator/);
});

test('nonselected retry failures are listed separately from scored slots',()=>{
  const summary=report();
  summary.observed_nonpass_attempts=[{
    planned_unit_id:'slot-0',attempt_id:'retry-attempt',state:'infrastructure_failure',
    phase:'evaluation',selected_for_scoring:false,
  }];
  summary.unselected_nonpass_attempt_count=1;
  const html=renderFinalSuiteSummary(summary);
  assert.match(html,/5 nonpass slots/);
  assert.match(html,/1 nonselected retry failures/);
  assert.match(html,/retry-attemp/);
});

test('retry audit count mismatch withholds the distribution',()=>{
  const summary=report();
  summary.observed_nonpass_attempts=[{
    planned_unit_id:'slot-0',attempt_id:'retry-attempt',state:'failed',
    phase:'evaluation',selected_for_scoring:false,
  }];
  assert.match(renderFinalSuiteSummary(summary),/failed its count check and is withheld/);
});

test('published default conserves all frozen slots and binds every nonpass and stop to evidence',async()=>{
  const root=new URL('../data/experiments/',import.meta.url);
  const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
  const entry=catalog.releases.find(row=>row.id===catalog.default_analysis);
  const bytes=await readFile(new URL(entry.path,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.files[entry.path]);
  assert.equal(/\/home\/carter\/|file:\/\//.test(bytes.toString()),false,
    'published evidence must not contain host filesystem paths');
  const release=JSON.parse(bytes);
  const summary=release.final_suite;
  assert.equal(summary.complete,true);
  assert.equal(summary.uniform_suite_verified,true);
  assert.equal(summary.totals.pending,0);
  assert.equal(release.cells.length,445);
  const checkpoints=release.cells.flatMap(cell=>cell.checkpoints);
  assert.equal(checkpoints.length,740);
  const byId=new Map(checkpoints.map(cp=>[cp.planned_unit_id,cp]));
  assert.equal(byId.size,740);
  assert.ok(checkpoints.every(cp=>cp.suite_release_id===summary.suite_release_id));
  const failures=checkpoints.filter(cp=>cp.nonpass_category);
  assert.equal(failures.length,summary.totals.nonpassed);
  assert.deepEqual(new Set(summary.nonpass_units.map(row=>row.planned_unit_id)),
    new Set(failures.map(cp=>cp.planned_unit_id)));
  assert.equal(Object.values(summary.category_counts).reduce((a,b)=>a+b,0),failures.length);
  assert.equal(checkpoints.filter(cp=>cp.state==='passed').length,summary.totals.passed);
  const stops=checkpoints.filter(cp=>cp.state==='stopped_by_policy');
  assert.equal(stops.length,summary.totals.policy_stopped);
  for(const cp of stops){
    const proof=cp.policy_stop_proof;
    const predecessor=byId.get(proof.predecessor_planned_unit_id);
    assert.equal(predecessor.selected_attempt_id,proof.attempt_id);
    assert.equal(predecessor.evaluation_sha256,proof.evaluation_sha256);
    assert.ok(proof.reason==='failed_structure_gate'||proof.reason==='upstream_delivery_failure');
    if(proof.reason==='upstream_delivery_failure')assert.equal(predecessor.candidate_failure,'delivery_failure');
    else assert.equal(predecessor.gate_passed,false);
    assert.equal(cp.attempted,false);
    assert.equal(cp.evaluation_sha256,null);
    assert.ok(cp.expected_test_counts===null||Number.isInteger(cp.expected_test_counts?.total));
  }
  const measured=checkpoints.filter(cp=>cp.evaluation_sha256);
  assert.equal(measured.length,summary.selected_evaluation_attempts);
  assert.ok(measured.every(cp=>cp.suite_application_proof_sha256&&cp.suite_id&&cp.environment_sha256));
  for(const cell of release.cells.filter(cell=>cell.mode==='pipeline')){
    const last=cell.checkpoints.at(-1);
    if(last.score_override?.reason==='agent_failure'){
      const result=finalResult(cell,release.cells);
      assert.equal(result.passed,0);
      assert.equal(result.reason,'agent_failure');
    }
  }
  assert.equal(summary.observed_nonpass_attempts.filter(row=>!row.selected_for_scoring).length,
    summary.unselected_nonpass_attempt_count);
  assert.match(renderFinalSuiteSummary(summary),new RegExp(`All ${failures.length} nonpass slots`));
});
