import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finalResult, fraction} from '../experiments-core.mjs';

test('published EF UART delivery failures have exact final totals in both efforts',async()=>{
  const root=new URL('../data/experiments/',import.meta.url);
  const id='5667349f28caf00f99155395112bb70f856d5d5a3e0a24ec1c07ea6a5a155bf7';
  const release=JSON.parse(await readFile(new URL(`analyses/${id}.json`,root),'utf8'));
  assert.equal(release.cells.length,212);
  const uart=release.cells.filter(cell=>cell.problem==='ef_uart_t1'&&cell.mode==='pipeline');
  assert.deepEqual(uart.map(cell=>cell.thinking).sort(),['high','medium']);
  for(const cell of uart){
    assert.equal(fraction(finalResult(cell,release.cells)),'0/9');
    assert.equal(finalResult(cell,release.cells).reason,'delivery_failure');
    assert.equal(cell.checkpoints[0].target_checkpoint,'checkpoint_1');
    assert.equal(cell.checkpoints[0].candidate_failure_reason,'missing required entrypoint build_checkpoint.sh');
    assert.ok(cell.checkpoints.slice(1).every(cp=>cp.state==='stopped_by_policy'));
    const inventory=cell.expected_test_counts.checkpoint_6;
    assert.deepEqual(inventory.groups,{core:3,error:1,functionality:0,regression:4,structure:1});
  }
  for(const cell of release.cells.filter(cell=>cell.mode==='pipeline')){
    assert.ok(finalResult(cell,release.cells).total>0,`${cell.problem} ${cell.thinking}: missing final denominator`);
  }
});
