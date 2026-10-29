import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {latestCells, modelKey, finalResult, fraction} from '../experiments-core.mjs';

const id='6dc6f954869bfb493fd6889fe9a933fc2d3268c22e87a8b7cfea76f67c9e85c1';
const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));

test('completed Low/xhigh release has four complete columns and finite Pipeline denominators',async()=>{
  const analysis=await load(`experiments/analyses/${id}.json`);
  const cells=latestCells(analysis.cells);
  assert.equal(cells.length,356);
  assert.equal(new Set(cells.map(c=>c.problem)).size,15);
  assert.equal(new Set(cells.map(modelKey)).size,4);
  for(const thinking of ['low','medium','high','xhigh']) {
    const setting=cells.filter(c=>c.thinking===thinking);
    assert.equal(setting.length,89);
    assert.equal(setting.filter(c=>c.mode==='pipeline').length,15);
    assert.equal(setting.filter(c=>c.mode==='sr').length,74);
    assert.ok(setting.every(c=>c.status==='completed'));
    if(['low','xhigh'].includes(thinking)) {
      assert.ok(setting.filter(c=>!['clic_t1','serv_t1'].includes(c.problem)).every(c=>c.score!==null));
    }
  }
  for(const cell of cells.filter(c=>c.mode==='pipeline'&&['low','xhigh'].includes(c.thinking))) {
    const result=finalResult(cell,cells);
    assert.ok(Number.isInteger(result.total)&&result.total>0,`${cell.problem}/${cell.thinking}`);
    assert.ok(Number.isInteger(result.passed)&&result.passed>=0&&result.passed<=result.total);
  }
  const common=cells.find(c=>c.problem==='common_cells_t1'&&c.thinking==='xhigh'&&c.mode==='pipeline');
  assert.equal(fraction(finalResult(common,cells)),'34/43');
  const previous=await load('experiments/analyses/9dca9ae8f31e4de703f75339ed078a093bf0fe159b1435307f0d16d26300ddb0.json');
  const selected=new Map(cells.map(c=>[c.id,c]));
  for(const cell of previous.cells) assert.deepEqual(selected.get(cell.id),cell);
});

test('all four complete paper settings retain 15 chains, 74 SR checkpoints and no scoring issues',async()=>{
  const report=await load(`paper/reports/${id}.json`);
  assert.equal(report.groups.length,4);
  for(const group of report.groups) {
    assert.deepEqual(group.issues,[]);
    assert.equal(group.coverage.num_chains,15);
    assert.equal(group.coverage.num_checkpoints,74);
    for(const metric of Object.values(group.primary)) assert.notEqual(metric.value,null);
  }
});
