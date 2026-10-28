import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hydrateCells, testCounts, plannedTargets, checkpointRows, finalResult, fraction, isDeliveryFailure, csv} from '../experiments-core.mjs';
const counts=(passed,total)=>({passed,total});
const cp=(target,core=[1,2],regression=[2,3],structure=[1,1])=>({checkpoint:target,target_checkpoint:target,state:'failed',candidate:'candidate',test_counts:{core:counts(...core),regression:counts(...regression),structure:counts(...structure),total:counts(core[0]+regression[0]+structure[0],core[1]+regression[1]+structure[1])}});
const pipeline={id:'p',problem:'problem',mode:'pipeline',generation:'g',evaluation_generation:'g',planned_checkpoints:2,progression_policy:'structure-cases',status:'completed',outcome:'failed',checkpoints:[cp('checkpoint_1'),cp('checkpoint_2')]};

test('main result uses all final-checkpoint tests rather than passed checkpoints or group rates',()=>{
  assert.deepEqual(finalResult(pipeline),{passed:4,total:6,target:'checkpoint_2',reason:'evaluated'});
  assert.equal(fraction(finalResult(pipeline)),'4/6');
  assert.equal(finalResult({...pipeline,mode:'sr'}).reason,'not_pipeline');
  assert.equal(finalResult({...pipeline,progression_policy:'core-cases'}).reason,'other_policy');
  assert.equal(finalResult({...pipeline,progression_policy:'unknown'}).reason,'policy_unknown');
});

test('structure stop has zero numerator and obtains denominator only from the same evaluation revision',()=>{
  const stopped={...pipeline,checkpoints:[cp('checkpoint_1',[1,2],[0,0],[0,1]),{target_checkpoint:'checkpoint_2',state:'stopped_by_policy'}]};
  assert.deepEqual(finalResult(stopped,[pipeline]),{passed:0,total:6,target:'checkpoint_2',reason:'structure_stop'});
  assert.equal(fraction(finalResult(stopped,[{...pipeline,generation:'different'}])),'0/?');
  assert.equal(fraction(finalResult(stopped,[{...pipeline,evaluation_generation:'different'}])),'0/?');
  assert.equal(finalResult({...stopped,expected_test_counts:{checkpoint_2:{total:12}}}).total,12);
  assert.equal(finalResult(stopped,[pipeline,{...pipeline,checkpoints:[cp('checkpoint_2',[1,9])]}]).total,null);
});

test('core failure, infrastructure loss, and missing runs never become structure-stop zeros',()=>{
  const partial={...pipeline,checkpoints:[cp('checkpoint_1',[0,2]) ]};
  assert.equal(finalResult(partial,[pipeline]).passed,null);
  assert.equal(finalResult({...partial,checkpoints:[{...partial.checkpoints[0],state:'evaluation_error'}]},[pipeline]).passed,null);
  assert.equal(finalResult({...partial,outcome:'not_scored'},[pipeline]).passed,null);
  assert.equal(finalResult({...pipeline,checkpoints:[]}).passed,null);
  assert.equal(fraction(finalResult({...pipeline,checkpoints:[]})),'—');
});

test('delivery failure retains its cause and uses the frozen final denominator after a gate stop',()=>{
  const failed={...cp('checkpoint_1',[0,1],[0,0],[0,1]),candidate_failure:'delivery_failure',candidate_failure_reason:'missing required entrypoint build_checkpoint.sh'};
  const stopped={...pipeline,checkpoints:[failed,{target_checkpoint:'checkpoint_2',state:'stopped_by_policy'}],expected_test_counts:{checkpoint_2:{total:9}}};
  assert.equal(isDeliveryFailure(failed),true);
  assert.deepEqual(finalResult(stopped),{passed:0,total:9,target:'checkpoint_2',reason:'delivery_failure'});
  assert.equal(finalResult({...stopped,expected_test_counts:undefined}).reason,'delivery_total_unknown');
  // A typed delivery verdict can precede collection of this checkpoint's counts.
  assert.equal(finalResult({...stopped,checkpoints:[{...failed,test_counts:null},stopped.checkpoints[1]]}).reason,'delivery_failure');
  assert.equal(finalResult({...stopped,checkpoints:[failed,{target_checkpoint:'checkpoint_2',state:'evaluation_error'}]}).passed,null);
  assert.equal(isDeliveryFailure({...failed,state:'evaluation_error'}),false);
});

test('final-checkpoint delivery failures and reviewed historical labels remain visible',()=>{
  const failed={...cp('checkpoint_2',[0,1],[0,0],[0,1]),candidate_failure:'delivery_failure'};
  assert.equal(finalResult({...pipeline,checkpoints:[failed]}).reason,'delivery_failure');
  const reviewed={...failed,candidate_failure:null,defects:[{labels:['delivery_failure'],confidence:'reviewed'}]};
  assert.equal(isDeliveryFailure(reviewed),true);
  assert.equal(isDeliveryFailure({...reviewed,defects:[{labels:['delivery_failure'],confidence:'suspected'}]}),false);
  assert.match(csv([{...pipeline,checkpoints:[failed]}]),/"delivery_failure"/);
});

test('submatrix alternates pipeline and SR in numeric checkpoint order, including unrun planned rows',()=>{
  const cells=[{...pipeline,planned_targets:['checkpoint_10','checkpoint_2','checkpoint_1']},{mode:'sr',checkpoints:[{target_checkpoint:'checkpoint_3'}]}];
  assert.deepEqual(checkpointRows(cells).map(row=>row.label),['pipeline c1','sr1','pipeline c2','sr2','pipeline c3','sr3','pipeline c10','sr10']);
  assert.deepEqual(plannedTargets(pipeline),['checkpoint_1','checkpoint_2']);
});

test('group denominators include skipped tests and empty/lazy results remain unknown',()=>{
  const checkpoint={tests:[{group:'Core',status:'passed'},{group:'Core',status:'skipped'},{group:'Regression',status:'failed'},{group:'Structure',status:'passed'}]};
  assert.deepEqual(testCounts(checkpoint,'core'),counts(1,2));
  assert.deepEqual(testCounts(checkpoint,'regression'),counts(0,1));
  assert.deepEqual(testCounts(checkpoint,'error'),counts(0,0));
  assert.deepEqual(testCounts(checkpoint),counts(2,4));
  assert.equal(testCounts({tests:[],test_count:4},'core'),null);
});

test('legacy group counts and actual policy join by unique source URL and candidate only',()=>{
  const cell={...pipeline,progression_policy:undefined,legacy_origin:{source_url:'url'},planned_checkpoints:1,checkpoints:[{checkpoint:'checkpoint_1',target_checkpoint:'checkpoint_3',candidate:'candidate'}]};
  const raw={sourcePath:'url',expected_checkpoints:3,publication_provenance:{actual_pass_policy:'structure-cases'},checkpoints:[{checkpoint:'checkpoint_1',code_snapshot:{tree_sha256:'candidate'},evaluation:{counts:{structure:[1,1],core:[2,3],functionality:[0,0],regression:[4,5],error:[0,0]}}}]};
  const [result]=hydrateCells([cell],[{evaluationRuns:[raw]}]);
  assert.equal(result.progression_policy,'structure-cases');
  assert.equal(result.planned_checkpoints,3);
  assert.deepEqual(testCounts(result.checkpoints[0],'core'),counts(2,3));
  assert.deepEqual(testCounts(result.checkpoints[0]),counts(7,9));
  const [mismatch]=hydrateCells([cell],[{evaluationRuns:[{...raw,checkpoints:[{...raw.checkpoints[0],code_snapshot:{tree_sha256:'different'}}]}]}]);
  assert.equal(testCounts(mismatch.checkpoints[0]),null);
  assert.equal(hydrateCells([cell],[{evaluationRuns:[raw,raw]}])[0].progression_policy,'unknown');
});

test('published SERV diagnostic retains exact final and SR counts without upgrading comparability',async()=>{
  const root=new URL('../data/',import.meta.url);
  const catalog=JSON.parse(await readFile(new URL('experiments/catalog.json',root),'utf8'));
  const entry=catalog.releases.find(r=>r.id==='ab8a5338da36dcaa6647e9be84c3b5b4f20d643944020f5d81fb0bec3a35bb63');
  const release=JSON.parse(await readFile(new URL('experiments/'+entry.path,root),'utf8'));
  const payload=JSON.parse(await readFile(new URL('problems.json',root),'utf8'));
  const cells=hydrateCells(release.cells,payload.problems);
  const serv=cells.find(c=>c.problem==='serv-t1'&&c.mode==='pipeline');
  assert.equal(fraction(finalResult(serv,cells)),'24/30');
  assert.equal(serv.formal,false);
  assert.equal(serv.score,null);
  assert.equal(fraction(testCounts(serv.checkpoints.at(-1),'core')),'1/1');
  assert.equal(fraction(testCounts(serv.checkpoints.at(-1),'regression')),'14/20');
  const sr=cells.find(c=>c.problem==='serv-t1'&&c.mode==='sr'&&c.checkpoints[0].target_checkpoint==='checkpoint_10');
  assert.equal(fraction(testCounts(sr.checkpoints[0],'regression')),'20/20');
});

test('Functionality is a Core alias in saved totals and nodes, with no double counting of dual markers',()=>{
  const saved={test_counts:{core:{passed:18,total:18},functionality:{passed:0,total:1},total:{passed:24,total:25}}};
  assert.deepEqual(testCounts(saved,'core'),{passed:18,total:19});
  assert.deepEqual(testCounts(saved,'functionality'),{passed:18,total:19});
  assert.deepEqual(testCounts(saved),{passed:24,total:25});
  const nodes={tests:[{group:'Core',status:'passed',markers:['core','functionality']},{group:'Functionality',status:'failed'}]};
  assert.deepEqual(testCounts(nodes,'core'),{passed:1,total:2});
  assert.deepEqual(testCounts(nodes),{passed:1,total:2});
  assert.deepEqual(testCounts({...nodes,test_counts:{core:{passed:1,total:1},functionality:{passed:3,total:1}}},'core'),{passed:1,total:2});
});
