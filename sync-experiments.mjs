import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

export function safePath(path) {
  if(typeof path!=='string'||path.startsWith('/')||path.split('/').some(p=>['..','.',''].includes(p))||!path.endsWith('.json')||path.includes('\\'))throw new Error('Invalid experiment manifest path');
  return path;
}
export function validatePublicAnalysis(value) {
  if(value.schema_version!==4||!Array.isArray(value.cells))throw new Error('Unsupported experiment analysis');
  const forbidden=new Set(['route_snapshot','api_key','api_key_env','endpoint','error_message','traceback','command','env','project','run']);
  function visit(node){if(!node||typeof node!=='object')return;for(const [key,value] of Object.entries(node)){if(forbidden.has(key))throw new Error(`Private experiment field: ${key}`);visit(value);}}
  visit(value);
  for(const cell of value.cells){if(typeof cell.id!=='string'||typeof cell.model!=='string'||typeof cell.agent!=='string'||!Array.isArray(cell.checkpoints))throw new Error('Malformed experiment cell');}
  return value;
}
async function writeChanged(file,text){let previous;try{previous=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(previous!==text){await mkdir(dirname(file),{recursive:true});await writeFile(file,text);}}
export async function syncExperiments({readText,sourceCommit,output}) {
  let text;
  try{text=await readText('experiments/catalog.json');}catch(error){if(String(error.message).includes('GitHub API 404'))return;throw error;}
  const catalog=JSON.parse(text);
  if(catalog.schema_version!==4||!Array.isArray(catalog.releases))throw new Error('Unsupported experiment catalog');
  // Site-published evaluator retests have their own immutable release. Keep
  // them through scheduled source synchronization until explicitly retired.
  let local;
  try { local=JSON.parse(await readFile(resolve(output,'site-releases.json'),'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  const localIds=new Set();
  if(local){
    if(local.schema_version!==1||!Array.isArray(local.releases))throw new Error('Unsupported site release catalog');
    for(const release of local.releases){
      if(localIds.has(release.id)||catalog.releases.some(r=>r.id===release.id&&JSON.stringify(r)!==JSON.stringify(release)))throw new Error('Conflicting site release');
      localIds.add(release.id);
      if(!catalog.releases.some(r=>r.id===release.id))catalog.releases.push(release);
    }
    if(local.default_analysis){
      if(!localIds.has(local.default_analysis))throw new Error('Unknown site default release');
      catalog.default_analysis=local.default_analysis;
    }
  }
  // Validate every dependency before publishing the new manifest.
  const pending=new Map();
  for(const release of catalog.releases){safePath(release.path);if(!/^[a-f0-9]{64}$/.test(release.id))throw new Error('Invalid release id');
    if(!release.files?.[release.path])throw new Error('Missing analysis hash');
    for(const [path,expected] of Object.entries(release.files)){
      safePath(path);
      let payload=pending.get(path);
      if(payload===undefined){
        // Immutable evidence already checked out with the site needs no API call.
        // Trust the bytes only after matching the current source manifest hash.
        try {
          const cached=await readFile(resolve(output,path),'utf8');
          if(createHash('sha256').update(cached).digest('hex')===expected)payload=cached;
        } catch(error) { if(error.code!=='ENOENT')throw error; }
        if(payload===undefined){
          if(localIds.has(release.id))throw new Error(`Missing or corrupt site evidence: ${path}`);
          payload=await readText(`experiments/${path}`);
        }
      }
      if(createHash('sha256').update(payload).digest('hex')!==expected)throw new Error(`Experiment hash mismatch: ${path}`);
      const value=JSON.parse(payload);if(path===release.path)validatePublicAnalysis(value);
      pending.set(path,payload);
    }
  }
  for(const [path,payload] of pending)await writeChanged(resolve(output,path),payload);
  await writeChanged(resolve(output,'catalog.json'),JSON.stringify({...catalog,source:{commit:sourceCommit}},null,2)+'\n');
}
