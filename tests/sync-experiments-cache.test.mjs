import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {syncExperiments} from '../sync-experiments.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const analysis = JSON.stringify({schema_version:4,cells:[]});
function fixture() {
  const shared = JSON.stringify({version:1});
  const catalog = {schema_version:4,releases:['a','b'].map(letter => {
    const id=letter.repeat(64), path=`analyses/${id}.json`;
    return {id,path,files:{[path]:sha(analysis),'protocols/shared.json':sha(shared)}};
  })};
  return {catalog,shared};
}

test('each shared immutable dependency is fetched once per sync', async () => {
  const output=await mkdtemp(join(tmpdir(),'experiment-sync-'));
  try {
    const {catalog,shared}=fixture(), fetched=[];
    await syncExperiments({output,sourceCommit:'pinned',readText:async path=>{
      fetched.push(path);
      return path.endsWith('catalog.json')?JSON.stringify(catalog):
        path.endsWith('shared.json')?shared:analysis;
    }});
    assert.equal(fetched.filter(p=>p.endsWith('shared.json')).length,1);
    assert.equal(fetched.length,4);
  } finally { await rm(output,{recursive:true,force:true}); }
});

test('verified warm evidence makes only the catalog request', async () => {
  const output=await mkdtemp(join(tmpdir(),'experiment-sync-'));
  try {
    const {catalog,shared}=fixture();
    const remote=async path=>path.endsWith('catalog.json')?JSON.stringify(catalog):
      path.endsWith('shared.json')?shared:analysis;
    await syncExperiments({output,sourceCommit:'old',readText:remote});
    const fetched=[];
    await syncExperiments({output,sourceCommit:'new',readText:async path=>{
      fetched.push(path);assert.equal(path,'experiments/catalog.json');
      return remote(path);
    }});
    assert.deepEqual(fetched,['experiments/catalog.json']);
    assert.equal(JSON.parse(await readFile(join(output,'catalog.json'),'utf8')).source.commit,'new');
  } finally { await rm(output,{recursive:true,force:true}); }
});

test('a corrupted local dependency is re-fetched and checked', async () => {
  const output=await mkdtemp(join(tmpdir(),'experiment-sync-'));
  try {
    const {catalog,shared}=fixture(), fetched=[];
    await mkdir(join(output,'protocols'),{recursive:true});
    await writeFile(join(output,'protocols/shared.json'),'corrupted');
    await syncExperiments({output,sourceCommit:'pinned',readText:async path=>{
      fetched.push(path);
      return path.endsWith('catalog.json')?JSON.stringify(catalog):
        path.endsWith('shared.json')?shared:analysis;
    }});
    assert.equal(fetched.filter(p=>p.endsWith('shared.json')).length,1);
    assert.equal(await readFile(join(output,'protocols/shared.json'),'utf8'),shared);
  } finally { await rm(output,{recursive:true,force:true}); }
});

test('scheduled source sync retains a hash-verified site retest and its default selection',async()=>{
  const output=await mkdtemp(join(tmpdir(),'experiment-site-sync-'));
  try{
    const {catalog,shared}=fixture();
    const id='c'.repeat(64),path=`analyses/${id}.json`;
    const local={id,path,files:{[path]:sha(analysis)}};
    await mkdir(join(output,'analyses'),{recursive:true});
    await writeFile(join(output,path),analysis);
    await writeFile(join(output,'site-releases.json'),JSON.stringify({schema_version:1,releases:[local],default_analysis:id}));
    const remote=async path=>path.endsWith('catalog.json')?JSON.stringify(catalog):path.endsWith('shared.json')?shared:analysis;
    await syncExperiments({output,sourceCommit:'new',readText:remote});
    const synced=JSON.parse(await readFile(join(output,'catalog.json'),'utf8'));
    assert.equal(synced.default_analysis,id);
    assert.equal(synced.releases.length,3);
    assert.deepEqual(synced.releases.at(-1),local);
    // Corrupt retained evidence must fail closed without changing the catalog.
    const original=await readFile(join(output,'catalog.json'),'utf8');
    await writeFile(join(output,path),'corrupt');
    await assert.rejects(syncExperiments({output,sourceCommit:'newer',readText:remote}),/Missing or corrupt site evidence/);
    assert.equal(await readFile(join(output,'catalog.json'),'utf8'),original);
  }finally{await rm(output,{recursive:true,force:true});}
});
