import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {latestCells, testCounts} from '../experiments-core.mjs';
import {renderPublicationNotes} from '../experiments.mjs';

const root=new URL('../data/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
let publicationPromise;
const publication=()=>publicationPromise||=(async()=>{
  const manifest=await load('experiments/TERRA-HIGH89-20261103.json');
  const catalog=await load('experiments/catalog.json');
  const analysis=async id=>{
    const entry=catalog.releases.find(release=>release.id===id);
    assert.ok(entry,`Published analysis ${id}`);
    const text=await readFile(new URL(`experiments/${entry.path}`,root),'utf8');
    assert.equal(createHash('sha256').update(text).digest('hex'),entry.files[entry.path]);
    return {entry,value:JSON.parse(text)};
  };
  const [terra,combined,previous,defaultRelease]=await Promise.all([
    manifest.terra_analysis,manifest.combined_analysis,manifest.previous_analysis,
    catalog.default_analysis,
  ].map(analysis));
  const paths=Object.values(terra.value.detail_paths||{});
  const details=paths.length?(await Promise.all(paths.map(path=>load(`experiments/${path}`)))).flatMap(detail=>detail.cells):terra.value.cells;
  return {manifest,catalog,terra,combined,previous,defaultRelease,details};
})();

test('Terra publication contains all 89 completed trials and 148 planned checkpoints',async()=>{
  const {terra,defaultRelease}=await publication();
  assert.equal(defaultRelease.entry.id,defaultRelease.value.id);
  assert.equal(defaultRelease.value.final_suite.complete,true);
  assert.equal(defaultRelease.value.final_suite.uniform_suite_verified,true);
  assert.equal(terra.value.schema_version,4);
  assert.equal(terra.value.cells.length,89);
  assert.equal(new Set(terra.value.cells.map(cell=>cell.id)).size,89);
  assert.equal(latestCells(terra.value.cells).length,89);
  assert.equal(new Set(terra.value.cells.map(cell=>cell.problem)).size,15);
  assert.equal(terra.value.cells.filter(cell=>cell.mode==='pipeline').length,15);
  assert.equal(terra.value.cells.filter(cell=>cell.mode==='sr').length,74);
  assert.equal(terra.value.cells.reduce((sum,cell)=>sum+cell.planned_checkpoints,0),148);
  assert.ok(terra.value.cells.every(cell=>cell.status==='completed'&&cell.selected_attempt&&cell.score!=null));
  assert.ok(terra.value.cells.every(cell=>cell.model==='gpt-6.1-terra'&&cell.agent==='codex'&&cell.thinking==='high'));
  assert.equal(terra.value.cells.filter(cell=>cell.outcome==='passed').length,60);
  assert.equal(terra.value.cells.filter(cell=>cell.outcome==='failed').length,29);
  const checkpoints=terra.value.cells.flatMap(cell=>cell.checkpoints);
  assert.equal(checkpoints.length,148);
  assert.equal(checkpoints.filter(checkpoint=>checkpoint.state==='passed').length,90);
  assert.equal(checkpoints.filter(checkpoint=>checkpoint.state==='failed').length,48);
  assert.equal(checkpoints.filter(checkpoint=>checkpoint.state==='stopped_by_policy').length,10);
});

test('archived combined release retains Terra and every previous 445 trial unchanged',async()=>{
  const {terra,combined,previous}=await publication();
  assert.equal(previous.value.cells.length,445);
  assert.equal(combined.value.cells.length,534);
  assert.equal(new Set(combined.value.cells.map(cell=>cell.id)).size,534);
  const selected=new Map(combined.value.cells.map(cell=>[cell.id,cell]));
  for(const cell of previous.value.cells)assert.deepEqual(selected.get(cell.id),cell,`Retained ${cell.id}`);
  for(const cell of terra.value.cells)assert.deepEqual(selected.get(cell.id),cell,`Added ${cell.id}`);
});

test('all 138 executed Terra candidates have archives and unknown prices remain unknown',async()=>{
  const {terra,details}=await publication();
  assert.equal(details.length,89);
  const executed=details.flatMap(cell=>cell.checkpoints).filter(checkpoint=>checkpoint.state!=='stopped_by_policy');
  assert.equal(executed.length,138);
  assert.equal(Object.keys(terra.entry.artifacts).length,138);
  assert.ok(terra.value.cells.every(cell=>cell.official_cost_all_attempts===null&&cell.cost_coverage==='unknown'));
  for(const checkpoint of executed){
    assert.match(checkpoint.candidate,/^[a-f0-9]{64}$/);
    assert.match(checkpoint.inference_sha256,/^[a-f0-9]{64}$/);
    assert.match(checkpoint.evaluation_sha256,/^[a-f0-9]{64}$/);
    assert.equal(checkpoint.official_cost.usd,null);
    assert.equal(checkpoint.official_cost.coverage,'unknown');
    assert.equal(checkpoint.official_cost.reason,'unregistered_model');
    const artifact=checkpoint.candidate_artifact;
    assert.ok(artifact?.path.startsWith('experiments/artifacts/'));
    assert.match(artifact.sha256,/^[a-f0-9]{64}$/);
    assert.equal(terra.entry.artifacts[artifact.path.slice('experiments/'.length)],artifact.sha256);
  }
});

test('WB SR4 retains its 42 of 43 test failure and pipeline retains all four passed checkpoints',async()=>{
  const {details}=await publication();
  const wb=details.filter(cell=>cell.problem==='wb2axip_t2');
  const sr4=wb.find(cell=>cell.mode==='sr'&&cell.planned_targets.includes('checkpoint_4'));
  assert.ok(sr4);
  assert.equal(sr4.status,'completed');
  assert.equal(sr4.outcome,'failed');
  const checkpoint=sr4.checkpoints.find(checkpoint=>checkpoint.target_checkpoint==='checkpoint_4');
  assert.equal(checkpoint.state,'failed');
  assert.deepEqual(testCounts(checkpoint),{passed:42,total:43});
  assert.deepEqual(checkpoint.tests.filter(test=>test.status==='failed').map(test=>test.nodeid),['test_checkpoint_7_synthetic_property_failure_is_classified']);
  const pipeline=wb.find(cell=>cell.mode==='pipeline');
  assert.equal(pipeline.checkpoints.length,4);
  assert.ok(pipeline.checkpoints.every(checkpoint=>checkpoint.state==='passed'));
});

test('archived Terra paper report contains six settings and complete metrics with unknown cost',async()=>{
  const {manifest}=await publication();
  const report=await load(`paper/reports/${manifest.combined_analysis}.json`);
  assert.equal(report.groups.length,6);
  const terra=report.groups.filter(group=>group.config.model==='gpt-6.1-terra');
  assert.equal(terra.length,1);
  assert.equal(terra[0].coverage.num_chains,15);
  assert.equal(terra[0].coverage.num_checkpoints,74);
  assert.deepEqual(terra[0].issues,[]);
  for(const metric of Object.values(terra[0].primary))assert.notEqual(metric.value,null);
  for(const mode of ['pipeline','sr']){
    assert.equal(terra[0].resources[`${mode}_actual`].total_cost_usd,null);
    assert.equal(terra[0].resources[`${mode}_actual`].mean_cost_usd,null);
  }
});

test('publication provenance is rendered as escaped paragraphs without interpreting HTML',async()=>{
  assert.equal(renderPublicationNotes(), '');
  assert.equal(renderPublicationNotes({display_notes:[]}), '');
  assert.equal(renderPublicationNotes({display_notes:['<img src=x onerror="alert(1)">','A & B']}),'<div class="matrix-publication-notes matrix-method"><p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p><p>A &amp; B</p></div>');
  const {terra,combined}=await publication();
  for(const release of [terra.value,combined.value]){
    assert.ok(release.publication.display_notes.length>0);
    assert.ok(release.publication.display_notes.every(note=>typeof note==='string'));
    assert.equal(release.publication.report_url,'TERRA-HIGH89-20261103.md');
    const html=renderPublicationNotes(release.publication);
    assert.match(html,/class="matrix-publication-notes matrix-method"/);
    assert.equal((html.match(/<p>/g)||[]).length,release.publication.display_notes.length);
  }
});
