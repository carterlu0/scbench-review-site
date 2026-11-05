import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {finalResult, fraction, testCounts} from '../experiments-core.mjs';

const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));

test('current final counts agree with scored applicability while raw skips remain visible',async()=>{
  const latest=await json('data/results/latest.json');
  for(const [problem,total] of [['ef_uart_t1',9],['clint_t1',9],['serv_t1',26]]){
    const detail=latest.details[problem];
    const raw=await readFile(new URL('data/results/'+detail.path,root));
    assert.equal(createHash('sha256').update(raw).digest('hex'),detail.sha256);
    const cells=JSON.parse(raw).cells.filter(c=>c.mode==='pipeline');
    assert.equal(cells.length,7);
    for(const cell of cells){
      const cp=cell.checkpoints.at(-1);
      const result=finalResult(cell,cells);
      assert.equal(result.total,total,`${problem} ${cell.model} ${cell.thinking}`);
      const overview=latest.cells.find(c=>c.id===cell.id);
      assert.deepEqual(finalResult(overview,latest.cells),result);
      const group=latest.records.groups.find(g=>g.checkpoint_records.some(r=>r.cell_id===cell.id));
      const row=group.checkpoint_records.find(r=>r.cell_id===cell.id&&r.checkpoint_id===cp.target_checkpoint);
      if(cp.state==='stopped_by_policy'){
        assert.equal(result.passed,0);
        assert.equal(row.execution_status,'not_reached');
        assert.equal(row.strict_pass,0);
        assert.equal(cp.tests.length,0);
        assert.equal(cp.display_test_counts,undefined);
      }else{
        const groups=Object.values(row.groups);
        assert.equal(result.passed,groups.reduce((sum,g)=>sum+g.passed,0));
        assert.equal(result.total,groups.reduce((sum,g)=>sum+g.expected,0));
        const skipped=cp.tests.filter(t=>t.status==='skipped');
        assert.equal(skipped.length,problem==='clint_t1'?9:1);
        assert.equal(cp.tests.length,total+skipped.length);
      }
      if(problem==='ef_uart_t1')assert.equal(result.reason,'delivery_failure');
      if(problem==='serv_t1'&&cell.model==='gpt-6-luna'&&cell.thinking==='xhigh'){
        assert.equal(fraction(result),'26/26');
        assert.equal(cp.state,'passed');
        assert.equal(row.strict_pass,1);
        assert.deepEqual(cp.test_counts.total,{passed:26,total:27});
      }
    }
  }
});

test('an expected display inventory does not turn infrastructure loss into a scored zero',()=>{
  const cell={mode:'pipeline',progression_policy:'structure-cases',outcome:'failed',
    planned_targets:['checkpoint_1','checkpoint_2'],checkpoints:[
      {target_checkpoint:'checkpoint_1',state:'failed',candidate_failure:'delivery_failure'},
      {target_checkpoint:'checkpoint_2',state:'evaluation_error',display_expected_test_counts:{total:9}},
    ]};
  assert.equal(finalResult(cell).passed,null);
  assert.equal(testCounts(cell.checkpoints[1]),null);
});
