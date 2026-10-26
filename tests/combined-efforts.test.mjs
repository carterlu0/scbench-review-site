import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {modelKey, compareModelSettings, latestCells, selectCells, checkpointRows, testCounts, finalResult, fraction, csv} from '../experiments-core.mjs';

const combined='e4e7b44c75763cecf3cf51d7b197e3004dbb3a4cd8ad0c30a3dac5825d7b993a';
const root=new URL('../data/experiments/',import.meta.url);
async function release(id) {
  const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
  const entry=catalog.releases.find(r=>r.id===id);
  assert.ok(entry,`Published analysis ${id}`);
  return JSON.parse(await readFile(new URL(entry.path,root),'utf8'));
}

test('merged formal analysis retains 140 trials across 15 problems and four ordered effort columns',async()=>{
  const data=await release(combined);
  const cells=latestCells(selectCells(data,{scope:'formal'}));
  assert.equal(cells.length,140);
  assert.equal(new Set(cells.map(c=>c.problem)).size,15);
  assert.equal(cells.filter(c=>c.mode==='pipeline').length,21);
  assert.equal(cells.filter(c=>c.mode==='sr').length,119);
  assert.equal(new Set(cells.map(modelKey)).size,4);
  const columns=[...new Map(cells.map(c=>[modelKey(c),c])).values()].sort(compareModelSettings);
  assert.deepEqual(columns.map(c=>c.thinking),['low','medium','high','xhigh']);
  assert.equal(data.protocol_ids.length,2);
  assert.equal(selectCells(data,{protocol:data.protocol_ids[0]}).length+selectCells(data,{protocol:data.protocol_ids[1]}).length,140);
  for (const effort of ['low','medium','high','xhigh']) {
    assert.equal(cells.filter(c=>c.thinking===effort).length,effort==='high'?89:17);
  }
  // The other 13 families only ran High; they must not acquire invented zeros.
  assert.ok(cells.filter(c=>!['clic_t1','serv_t1'].includes(c.problem)).every(c=>c.thinking==='high'));
});

test('CLIC and SERV use all four efforts and preserve SERV structural de-duplication',async()=>{
  const data=await release(combined);
  const expected={clic_t1:{low:'0/9',medium:'0/9',high:'1/9',xhigh:'5/9'},serv_t1:{low:'0/26',medium:'11/26',high:'23/26',xhigh:'26/26'}};
  for (const [problem,scores] of Object.entries(expected)) {
    const cells=data.cells.filter(c=>c.problem===problem);
    assert.equal(cells.length,problem==='clic_t1'?24:44);
    assert.equal(checkpointRows(cells).length,problem==='clic_t1'?10:20);
    for (const [effort,score] of Object.entries(scores)) {
      const pipeline=cells.find(c=>c.mode==='pipeline'&&c.thinking===effort);
      assert.equal(fraction(finalResult(pipeline,data.cells)),score);
      const finalSr=cells.find(c=>c.mode==='sr'&&c.thinking===effort&&c.planned_targets.includes(problem==='clic_t1'?'checkpoint_5':'checkpoint_10'));
      assert.equal(finalSr.checkpoints[0].checkpoint,'checkpoint_1');
      if(problem==='serv_t1') assert.equal(fraction(testCounts(finalSr.checkpoints[0])),'26/26');
    }
  }
});

test('merging preserves every previously published High checkpoint and its frozen denominator',async()=>{
  const merged=await release(combined);
  const previous=await release('28c4c7fca95dd6093e0755fc05e8092e0a14d8af12413105ec023fe59337ca83');
  const byId=new Map(merged.cells.map(c=>[c.id,c]));
  for (const before of previous.cells) {
    const after=byId.get(before.id);
    assert.deepEqual(after.checkpoints,before.checkpoints);
    assert.deepEqual(after.expected_test_counts,before.expected_test_counts);
    assert.equal(after.selected_evaluation,before.selected_evaluation);
    assert.equal(after.score,before.score);
  }
});

test('CSV exports the effort so otherwise identical model rows can be distinguished',async()=>{
  const data=await release(combined);
  const rows=csv(data.cells).split('\r\n').map(row=>row.split(','));
  const column=rows[0].indexOf('"thinking"');
  assert.ok(column>=0);
  assert.deepEqual([...new Set(rows.slice(1).map(row=>row[column]))].sort(),['"high"','"low"','"medium"','"xhigh"']);
});
