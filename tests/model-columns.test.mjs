import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {modelKey, groupKey, latestCells, plannedTargets, finalResult, fraction} from '../experiments-core.mjs';

test('model columns ignore task environments and protocols but retain model, agent and effort identity',()=>{
  const cell={model:'gpt-6-luna',agent:'codex',agent_version:'0.141.0',thinking:'high',agent_config:'task-a',protocol:'p'};
  const other={...cell,agent_config:'task-b',protocol:'q'};
  assert.equal(modelKey(cell),modelKey(other));
  assert.notEqual(groupKey(cell),groupKey(other));
  for(const change of [{model:'other'},{agent:'opencode'},{agent_version:'next'},{thinking:'medium'}]) {
    assert.notEqual(modelKey(cell),modelKey({...cell,...change}));
  }
});

test('all 13 published High pipelines have final results, including four frozen inventory denominators',async()=>{
  const root=new URL('../data/experiments/',import.meta.url);
  const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
  const entry=catalog.releases.find(r=>r.id==='28c4c7fca95dd6093e0755fc05e8092e0a14d8af12413105ec023fe59337ca83');
  const release=JSON.parse(await readFile(new URL(entry.path,root),'utf8'));
  assert.equal(release.cells.length,72);
  assert.equal(release.test_inventory_ids.length,4);
  const actual=Object.fromEntries(release.cells.filter(c=>c.mode==='pipeline').map(c=>[c.problem,fraction(finalResult(c,release.cells))]));
  assert.deepEqual(actual,{
    common_cells_t1:'22/29',taxi_axi_t3:'0/37',verilog_pcie_t3:'0/14',
    verilog_axis_fifo_t1:'0/29',verilog_axis_fifo_t2:'24/25',
    verilog_ethernet_t1:'18/23',verilog_ethernet_t2:'27/34',
    ef_uart_t1:'0/9',clint_t1:'7/9',clic_t2:'9/9',mipi_dphy_t2:'72/73',
    register_interface_t1:'26/46',wb2axip_t2:'60/63',
  });
});

test('the published High batch occupies one model column, with one trial per problem and checkpoint row',async()=>{
  const root=new URL('../data/experiments/',import.meta.url);
  const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
  const entry=catalog.releases.find(r=>r.id==='7cda832f51a6db907c8bf0a18780530bfed6485b4334fbbca9ff119db0da9949');
  const release=JSON.parse(await readFile(new URL(entry.path,root),'utf8'));
  // This regression fixture is the 13-family, 72-trial formal High release.
  assert.equal(release.cells.length,72);
  const cells=latestCells(release.cells);
  assert.equal(cells.length,72);
  assert.equal(new Set(cells.map(modelKey)).size,1);
  const pipelines=cells.filter(c=>c.mode==='pipeline');
  assert.equal(pipelines.length,13);
  assert.equal(new Set(pipelines.map(c=>c.problem)).size,13);
  // Taxi used different environment hashes for its adjacent SR checkpoints.
  const taxi=cells.filter(c=>c.problem==='taxi_axi_t3');
  assert.equal(taxi.length,6);
  assert.ok(new Set(taxi.map(groupKey)).size>1);
  assert.equal(new Set(taxi.map(modelKey)).size,1);
  for(const pipeline of pipelines) {
    for(const target of plannedTargets(pipeline)) {
      assert.equal(cells.filter(c=>c.problem===pipeline.problem&&c.mode==='sr'&&plannedTargets(c).includes(target)).length,1);
    }
  }
});
