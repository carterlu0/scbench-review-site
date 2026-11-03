import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFinalSuiteSummary} from '../experiments.mjs?v=20261103-final-suite';

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
  assert.match(html,/All 5 selected nonpass slots/);
  for(const category of categories) assert.match(html,new RegExp(`failure-${category}`));
  for(let i=0;i<5;i++) assert.match(html,new RegExp(`slot-${i}`));
});

test('final-suite distribution is withheld when slot counts do not conserve',()=>{
  const summary=report();
  summary.category_counts.agent_failure=0;
  assert.match(renderFinalSuiteSummary(summary),/failed its count check and is withheld/);
  assert.doesNotMatch(renderFinalSuiteSummary(summary),/matrix-final-suite-chart/);
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
