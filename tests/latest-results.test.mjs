import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {latestCells, resultKey, hydrateCells} from '../experiments-core.mjs';

const cell={id:'old',problem:'p',mode:'pipeline',prompt_arm:'original',model:'m',agent:'codex',agent_version:'1',agent_config:'config',thinking:'high',protocol:'protocol',started_at:'2026-10-20T08:00:00Z',completed_at:'2026-10-20T20:00:00Z',outcome:'passed',checkpoints:[{target_checkpoint:'checkpoint_1'}]};

test('newest experiment replaces older successes and input revisions without merging checkpoints',()=>{
  const newer={...cell,id:'new',started_at:'2026-10-20T09:00:00Z',completed_at:'2026-10-20T10:00:00Z',outcome:'failed',generation:'new-version',checkpoints:[]};
  assert.deepEqual(latestCells([cell,newer]),[newer]);
  assert.deepEqual(latestCells([newer,cell]),[newer]);
  assert.deepEqual(newer.checkpoints,[]);
});

test('SR targets and distinct configuration settings remain independent',()=>{
  const cells=[cell,...[
    {mode:'sr',checkpoints:[{target_checkpoint:'checkpoint_1'}]},
    {mode:'sr',checkpoints:[{target_checkpoint:'checkpoint_2'}]},
    {model:'other'}, {agent:'opencode'}, {agent_version:'2'},
    {agent_config:'different'}, {thinking:'none'}, {protocol:'different'},
    {prompt_arm:'other'}, {problem:'other'},
  ].map((change,i)=>({...cell,...change,id:String(i)}))];
  assert.equal(latestCells(cells).length,cells.length);
  assert.equal(new Set(cells.map(resultKey)).size,cells.length);
  assert.equal(latestCells([{...cell,route:'one'},{...cell,id:'new',route:'two',started_at:'2026-10-21T08:00:00Z'}]).length,1);
});

test('timestamp fallback, offsets, invalid dates and ties are deterministic',()=>{
  const noStart={...cell,id:'fallback',started_at:'unknown',completed_at:'2026-10-21T08:00:00Z'};
  assert.equal(latestCells([cell,noStart])[0].id,'fallback');
  const local={...cell,id:'local',started_at:'2026-10-20T08:00:01.000001'};
  const offset={...cell,id:'offset',started_at:'2026-10-20T16:00:02+08:00'};
  assert.equal(latestCells([cell,local,offset])[0].id,'offset');
  const invalid={...cell,id:'invalid',started_at:'not-a-date',completed_at:null};
  assert.equal(latestCells([invalid,cell])[0].id,'old');
  const tieA={...cell,id:'a'},tieZ={...cell,id:'z'};
  assert.equal(latestCells([tieA,tieZ])[0].id,'z');
  assert.equal(latestCells([tieZ,tieA])[0].id,'z');
});

test('published duplicates collapse to the actual newest run, with SR targets retained',async()=>{
  const root=new URL('../data/',import.meta.url);
  const catalog=JSON.parse(await readFile(new URL('experiments/catalog.json',root),'utf8'));
  const entry=catalog.releases.find(r=>r.id==='ab8a5338da36dcaa6647e9be84c3b5b4f20d643944020f5d81fb0bec3a35bb63');
  const release=JSON.parse(await readFile(new URL('experiments/'+entry.path,root),'utf8'));
  const payload=JSON.parse(await readFile(new URL('problems.json',root),'utf8'));
  const hydrated=hydrateCells(release.cells,payload.problems);
  const selected=latestCells(hydrated);
  assert.equal(hydrated.length,117);
  assert.equal(selected.length,89);
  assert.equal(new Set(selected.map(resultKey)).size,selected.length);
  const ethernet=selected.filter(c=>c.problem==='verilog-ethernet-t2'&&c.mode==='pipeline');
  assert.equal(ethernet.length,1);
  assert.match(ethernet[0].legacy_origin.source_url,/20260824t202022\.json$/);
  assert.equal(ethernet[0].outcome,'failed');
  assert.equal(selected.filter(c=>c.problem==='serv-t1'&&c.mode==='sr').length,10);
});
