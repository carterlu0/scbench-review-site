import {escapeHtml as esc, modelKey, compareModelSettings, resultKey, latestCells, selectCells, summarize, csv, hydrateCells, testCounts, checkpointRows, plannedTargets, finalResult, fraction, isDeliveryFailure} from './experiments-core.mjs?v=20261031-agent-failure';
import {renderPaperMetrics, selectPaperGroups, paperCsv} from './paper-metrics.mjs?v=20261031-zero-failure-costs';
let catalogPromise;
let paperCatalogPromise;
let metadataPromise;
let renderedProblem;
let renderedTrial;
const releases = new Map();
const percent = n => n == null ? '—' : `${(n*100).toFixed(0)}%`;
const dollars = n => n == null ? 'unknown' : `$${n.toFixed(3)}`;
const seconds = n => n == null ? '—' : `${Math.round(n)}s`;
const reasons = {agent_failure:'Agent failure · provisional', evaluated:'Final checkpoint', delivery_failure:'Delivery failure', delivery_total_unknown:'Delivery failure · total unknown', structure_stop:'Stopped by structure gate', stopped_total_unknown:'Structure gate stopped · total unknown', policy_unknown:'Progression policy unknown', other_policy:'Different progression policy', not_reached:'Final checkpoint not reached'};
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function options(values, selected, all) {
  return `${all ? `<option value="">${esc(all)}</option>` : ''}${[...new Set(values)].sort().map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('')}`;
}
async function json(path) {
  const response = await fetch(path, {cache:'no-cache'});
  if(!response.ok) throw new Error(`Experiment data unavailable (${response.status})`);
  return response.json();
}
function hash(params, changes = {}) {
  const next = new URLSearchParams(params);
  for (const [key,value] of Object.entries(changes)) {
    if (value == null || value === '') next.delete(key); else next.set(key,value);
  }
  // Both modes belong in a problem page. Main results always use pipeline.
  next.delete('mode'); next.delete('column');
  return `#experiments?${next}`;
}
function modelColumns(cells, includeArm = false) {
  const keyOf = c => includeArm ? JSON.stringify([modelKey(c),c.prompt_arm]) : modelKey(c);
  const groups = new Map();
  for (const cell of cells) if (!groups.has(keyOf(cell))) groups.set(keyOf(cell),cell);
  return {columns:[...groups.entries()].sort((a,b)=>compareModelSettings(a[1],b[1])||a[0].localeCompare(b[0])), keyOf};
}
function columnHeader(cell, includeArm = false) {
  return `<th scope="col"><span>${esc(cell.model)} · ${esc(cell.thinking)}</span><small>${esc(cell.agent)} ${esc(cell.agent_version)}</small>${includeArm?`<small>${esc(cell.prompt_arm)}</small>`:''}</th>`;
}
function resultClass(result) {
  if (result.passed == null || result.total == null) return 'pending';
  return result.passed === result.total ? 'pass' : result.passed === 0 ? 'fail' : 'partial';
}
function mainMatrix(cells, peers, params) {
  const pipeline = cells.filter(c=>c.mode==='pipeline');
  const {columns,keyOf} = modelColumns(pipeline);
  const problems = [...new Set(cells.map(c=>c.problem))].sort();
  return `<div class="matrix-section-title"><h2>Pipeline · final checkpoint</h2><span>structure-cases · passed / total tests</span></div>
    <div class="matrix-scroll" tabindex="0" role="region" aria-label="Main pipeline results"><table class="experiment-matrix main-matrix"><caption class="sr-only">Pipeline final checkpoint results under the structure-cases progression policy</caption><thead><tr><th scope="col">Problem / experiment arm</th>${columns.map(([,c])=>columnHeader(c)).join('')}</tr></thead><tbody>
    ${problems.flatMap(problem=>[...new Set(cells.filter(c=>c.problem===problem).map(c=>c.prompt_arm))].sort().map(arm=>`<tr><th scope="row"><a class="matrix-problem-link" href="${hash(params,{problem,prompt_arm:arm,trial:null})}">${esc(problem)}</a><small>${esc(arm)}</small></th>${columns.map(([key])=>{
      const matches=pipeline.filter(c=>c.problem===problem&&c.prompt_arm===arm&&keyOf(c)===key);
      if(!matches.length)return '<td class="matrix-empty">—</td>';
      return `<td>${matches.map(cell=>{const result=finalResult(cell,peers);return `<a class="matrix-cell ${resultClass(result)}" href="${hash(params,{problem,prompt_arm:arm,trial:cell.id})}" aria-label="Inspect ${esc(problem)} ${esc(cell.model)}"><strong>${fraction(result)}</strong><span>${esc(reasons[result.reason]||result.reason)}</span><small>${esc(result.target||'')} · latest${cell.formal?'':' · historical / unverified'}</small></a>`;}).join('')}</td>`;
    }).join('')}</tr>`)).join('')||`<tr><td colspan="${columns.length+1}">No trials match these filters.</td></tr>`}</tbody></table></div>
    <p class="matrix-method">Only the latest experiment for each configuration is shown, ordered by start time (completion time when unavailable). Each result is the final checkpoint’s passed / total tests, including every test group. A verified structure-gate stop or delivery failure contributes 0 / the final total. Delivery failures are labeled separately; their missing deliverables are shown in trial evidence. Unknown policy, missing evaluation and infrastructure failures remain unscored. Click a problem to compare pipeline checkpoints and SR results.</p>`;
}
function problemMatrix(cells, problem, params) {
  const {columns,keyOf}=modelColumns(cells,true);
  const rows=checkpointRows(cells);
  return `<div class="matrix-section-title"><h2>Checkpoint × model / agent</h2><span>Core and Regression · passed / total</span></div>
    <div class="matrix-scroll" tabindex="0" role="region" aria-label="Problem checkpoint results"><table class="experiment-matrix problem-matrix"><caption class="sr-only">Interleaved pipeline and SR checkpoint results, with Core and Regression counts</caption><thead><tr><th scope="col">Checkpoint / experiment</th>${columns.map(([,c])=>columnHeader(c,true)).join('')}</tr></thead><tbody>${rows.map(row=>`<tr data-mode="${row.mode}" data-checkpoint="${esc(row.target)}"><th scope="row"><span class="checkpoint-label">${row.label}</span><small>${row.mode==='pipeline'?'Cumulative workspace':'Adjacent golden predecessor'}</small></th>${columns.map(([key])=>{
      const matches=cells.filter(c=>keyOf(c)===key&&c.mode===row.mode&&(row.mode==='pipeline'?plannedTargets(c).includes(row.target):c.checkpoints.some(cp=>cp.target_checkpoint===row.target)));
      if(!matches.length)return '<td class="matrix-empty">—<small>No recorded run</small></td>';
      return `<td>${matches.map(cell=>{
        const cp=cell.checkpoints.find(cp=>cp.target_checkpoint===row.target);
        const agentFailure=cell.score_override?.value===0&&cell.score_override.reason==='agent_failure';
        const evaluated=cp&&(['passed','failed'].includes(cp.state)||agentFailure);
        const core=evaluated?testCounts(cp,'core'):null;
        const regression=evaluated?testCounts(cp,'regression'):null;
        const counts=core&&regression?{passed:core.passed+regression.passed,total:core.total+regression.total}:{};
        const deliveryStop=cp?.state==='stopped_by_policy'&&cell.checkpoints.some(previous=>isDeliveryFailure(previous)&&plannedTargets(cell).indexOf(previous.target_checkpoint)<plannedTargets(cell).indexOf(row.target));
        const status=agentFailure?'Agent failure · provisional':isDeliveryFailure(cp)?'Delivery failure':deliveryStop?'Stopped after delivery failure':evaluated?'':cp?.state==='stopped_by_policy'?'Stopped by progression gate':cp?.state||'Not reached';
        return `<a class="matrix-cell checkpoint-cell ${resultClass(counts)}" href="${hash(params,{problem,trial:cell.id,checkpoint:row.target})}" aria-label="Inspect ${esc(row.label)} ${esc(cell.model)}"><span class="test-count"><span>Core</span><strong>${fraction(core)}</strong></span><span class="test-count"><span>Regression</span><strong>${fraction(regression)}</strong></span><small>${esc(status||cell.progression_policy)} · latest${cell.formal?'':' · historical'}</small></a>`;
      }).join('')}</td>`;
    }).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length+1}">No matching trials for this problem.</td></tr>`}</tbody></table></div>
    <p class="matrix-method">Only the latest experiment for each configuration is shown; each SR target is selected independently. Pipeline rows use one latest pipeline run throughout, without filling missing checkpoints from older runs. Core and Regression are counted separately. 0/0 means no tests in that group; — means unavailable. Click a result for test failures, candidate code and execution details.</p>`;
}
function supplementary(release) {
  return `<div class="matrix-bottom"><section><h2>Implementation defects · full analysis</h2><p>Candidate defects are independent of the problem’s four-dimensional attribution.</p>${Object.keys(release.implementation_defects).length?`<dl>${Object.entries(release.implementation_defects).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${v} events</dd></div>`).join('')}</dl>`:'<p class="matrix-muted">No reviewed defect events in this analysis.</p>'}</section><section><h2>Annotation coverage · full analysis</h2><p>Revision-bound annotations also apply to matching historical records.</p><dl>${Object.entries(release.annotation_coverage).map(([k,v])=>`<div><dt>${esc(k.replaceAll('_',' '))}</dt><dd>${v}</dd></div>`).join('')||'<p class="matrix-muted">No classified test records.</p>'}</dl></section></div>
    <section class="matrix-label-statistics"><h2>Problem tag analysis · full analysis</h2>${release.problem_tag_statistics?.length?`<div class="matrix-scroll"><table class="matrix-checkpoints"><thead><tr><th>Tag</th><th>Problems</th><th>Passed tests</th><th>Failed tests</th><th>Macro test pass rate</th></tr></thead><tbody>${release.problem_tag_statistics.map(s=>`<tr><th>${esc(s.label)}</th><td>${s.problems}</td><td>${s.passed_tests}</td><td>${s.failed_tests}</td><td>${percent(s.macro_test_pass_rate)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="matrix-muted">No reviewed problem tags in this analysis.</p>'}</section>`;
}
export async function renderExperiments() {
  const route=location.hash;
  if(!route.startsWith('#experiments'))return;
  const app=document.querySelector('#app');
  const params=new URLSearchParams(route.split('?')[1]||'');
  app.innerHTML='<section class="experiment-page"><p role="status">Loading experiment matrix…</p></section>';
  try {
    catalogPromise ||= json('data/experiments/catalog.json');
    const catalog=await catalogPromise;
    if(location.hash!==route)return;
    if(!catalog.releases?.length){app.innerHTML='<section class="experiment-page"><h1>Experiment matrix</h1><p>No experiment analyses have been published yet.</p><a href="#problems">Browse problems →</a></section>';return;}
    const entry=catalog.releases.find(r=>r.id===params.get('analysis'))||catalog.releases.find(r=>r.id===catalog.default_analysis)||catalog.releases[0];
    if(!releases.has(entry.id))releases.set(entry.id,json(`data/experiments/${entry.path}`));
    const release=await releases.get(entry.id);
    const problem=params.get('problem');
    let paperReport=null;
    let paperRecords=null;
    if(!problem){
      paperCatalogPromise ||= json('data/paper/catalog.json').catch(()=>null);
      const paperCatalog=await paperCatalogPromise;
      const paperEntry=paperCatalog?.reports.find(r=>r.analysis_id===entry.id);
      paperReport=paperEntry?await json(`data/paper/${paperEntry.path}`):null;
      paperRecords=paperReport?await json(`data/paper/${paperReport.checkpoint_records_path}`):null;
    }
    metadataPromise ||= json('data/problems.json').then(data=>data.problems||[]).catch(()=>{metadataPromise=null;return [];});
    const problemsMetadata=await metadataPromise;
    const protocols={[release.protocol.id]:release.protocol};
    const hydrated=hydrateCells(release.cells,problemsMetadata,protocols);
    const filters={prompt_arm:params.get('prompt_arm')||'',protocol:params.get('protocol')||'',scope:params.get('scope')||'diagnostic',q:params.get('q')||'',model:params.get('model')||'',agent:params.get('agent')||''};
    if(!params.has('scope')&&hydrated.some(c=>c.formal))filters.scope='formal';
    const protocolIds=[...new Set(hydrated.map(c=>c.protocol))];
    if(!filters.protocol&&protocolIds.length===1)filters.protocol=protocolIds[0];
    const arms=[...new Set(hydrated.map(c=>c.prompt_arm))];
    if(!filters.prompt_arm&&arms.length===1)filters.prompt_arm=arms[0];
    const allFiltered=selectCells({cells:hydrated},filters);
    const filtered=latestCells(allFiltered);
    const requestedTrial=allFiltered.find(c=>c.id===params.get('trial'));
    if(requestedTrial){
      const selected=filtered.find(c=>resultKey(c)===resultKey(requestedTrial));
      if(selected&&selected.id!==requestedTrial.id){location.replace(hash(params,{trial:selected.id}));return;}
    }
    const cells=problem?filtered.filter(c=>c.problem===problem):filtered.filter(c=>c.mode==='pipeline');
    const total=summarize(cells);
    params.set('analysis',entry.id);
    const name=problem||'Experiment matrix';
    const subtitle=problem?'Pipeline and SR · checkpoint test results':`${esc(release.name)} · FDR / CC / FC / CPR`;
    if(location.hash!==route)return;
    app.innerHTML=`<section class="experiment-page">
      ${problem?`<a class="matrix-back" href="${hash(params,{problem:null,trial:null,checkpoint:null})}">← All experiment results</a>`:''}
      <div class="matrix-heading"><div><p class="eyebrow">SCBENCH / EXPERIMENTS${problem?' / PROBLEM':''}</p><h1>${esc(name)}<span class="matrix-dot">.</span></h1><p class="matrix-subtitle">${subtitle}</p></div><div class="matrix-actions"><button id="matrix-csv">Export CSV ↗</button><button id="matrix-json">JSON ↗</button></div></div>
      <div class="matrix-provenance"><span>Analysis <code>${esc(entry.id.slice(0,12))}</code></span><span>Source <code>${esc((catalog.source?.commit||'local').slice(0,12))}</code></span><span>Pricebook <code>${esc((release.pricebook||'unknown').slice(0,12))}</code></span><span>${esc(release.created_at.slice(0,10))}</span></div>
      <form id="matrix-filters" class="matrix-filters">
        <label>Analysis<select name="analysis">${catalog.releases.map(r=>`<option value="${esc(r.id)}" ${r.id===entry.id?'selected':''}>${esc(r.name)} · ${esc(r.id.slice(0,8))}</option>`).join('')}</select></label>
        <label>Protocol<select name="protocol">${options(protocolIds,filters.protocol,'All protocols')}</select></label>
        <label>Model<select name="model">${options(hydrated.map(c=>c.model),filters.model,'All models')}</select></label>
        <label>Agent<select name="agent">${options(hydrated.map(c=>c.agent),filters.agent,'All agents')}</select></label>
        <label>Prompt arm<select name="prompt_arm">${options(arms,filters.prompt_arm,'All (separate rows)')}</select></label>
        <label>Scope<select name="scope"><option value="formal" ${filters.scope==='formal'?'selected':''}>Formal</option><option value="diagnostic" ${filters.scope==='diagnostic'?'selected':''}>Historical / diagnostic</option></select></label>
        ${problem?'':`<label class="matrix-search">Find problem<input name="q" value="${esc(filters.q)}" placeholder="Search by name" /></label>`}<button type="submit">Apply</button>
      </form>
      ${problem?'':paperReport?renderPaperMetrics(paperReport,filters,params,paperRecords):'<p class="matrix-method">Paper metrics have not been built for this analysis. Existing test results remain available below.</p>'}
      <details class="paper-legacy-matrix" ${problem?'open':''}><summary>${problem?'Checkpoint evidence matrix':'Detailed problem and checkpoint evidence'}</summary>
      <div class="matrix-kpis"><div><span>${problem?'Recorded trials':'Pipeline trials'}</span><strong>${total.planned}</strong>${problem?'':`<small>${new Set(cells.map(c=>c.problem)).size} problems · ${filtered.length} total trials</small>`}</div><div><span>Comparable trials</span><strong>${total.valid}<small> / ${total.planned}</small></strong></div><div><span>Known checkpoint outcomes</span><strong>${cells.reduce((s,c)=>s+c.checkpoints.filter(cp=>['passed','failed'].includes(cp.state)).length,0)}</strong></div><div><span>SR trials</span><strong>${(problem?cells:filtered).filter(c=>c.mode==='sr').length}</strong><small>Independent checkpoint runs</small></div></div>
      ${problem?problemMatrix(cells,problem,params):mainMatrix(filtered,hydrated,params)}
      ${problem?'<section id="matrix-detail" class="matrix-detail" aria-live="polite"><p class="matrix-muted">Select a result to inspect its test cases and evidence.</p></section>':supplementary(release)}
      </details>
    </section>`;
    const trial=params.get('trial');
    if(renderedProblem!==problem||(renderedTrial&&!trial))window.scrollTo({top:0,left:0,behavior:'instant'});
    renderedProblem=problem;renderedTrial=trial;
    app.querySelector('#matrix-filters').addEventListener('submit',event=>{event.preventDefault();const next=new URLSearchParams(new FormData(event.currentTarget));if(problem)next.set('problem',problem);for(const key of ['aux','overhead','cache','task_type','threshold'])if(params.has(key))next.set(key,params.get(key));location.hash=`experiments?${next}`;});
    app.querySelector('#matrix-filters select[name="analysis"]').addEventListener('change',event=>{location.hash=hash(new URLSearchParams(),{analysis:event.target.value,problem});});
    app.querySelector('#matrix-csv').onclick=()=>download('scbench-experiments.csv',csv(cells),'text/csv;charset=utf-8');
    app.querySelector('#matrix-json').onclick=()=>download('scbench-experiments.json',JSON.stringify({...release,cells},null,2),'application/json');
    app.querySelectorAll('[data-paper-param]').forEach(input=>input.onchange=()=>{location.hash=hash(params,{[input.dataset.paperParam]:input.checked?'1':input.dataset.paperParam==='aux'?'0':null});});
    app.querySelectorAll('[data-paper-select]').forEach(select=>select.onchange=()=>{location.hash=hash(params,{[select.dataset.paperSelect]:select.value});});
    if(paperReport){
      app.querySelector('#paper-csv').onclick=()=>download('evortl-paper-metrics.csv',paperCsv(paperReport,{...filters,task_type:params.get('task_type')||''},params.get('cache')||'actual',params.get('threshold')||'structure-case',paperRecords),'text/csv;charset=utf-8');
      app.querySelector('#paper-json').onclick=async()=>{
        const records=await json(`data/paper/${paperReport.checkpoint_records_path}`);
        const selected=selectPaperGroups(paperReport,filters);const ids=new Set(selected.map(g=>g.id));
        download('evortl-paper-metrics.json',JSON.stringify({...paperReport,groups:selected,checkpoint_records:records.groups.filter(g=>ids.has(g.id))},null,2),'application/json');
      };
    }
    if(problem&&params.get('trial')) {
      let detailCells=cells;
      const path=release.detail_paths?.[problem];
      if(path){const detail=await json(`data/experiments/${path}`);if(location.hash!==route)return;const ids=new Set(cells.map(c=>c.id));detailCells=hydrateCells(detail.cells.filter(c=>ids.has(c.id)),problemsMetadata,protocols);}
      renderEvidence(detailCells.filter(c=>c.id===params.get('trial')),problem,catalog.source?.commit);
      if(params.get('checkpoint')) {
        const summaries=app.querySelectorAll('.matrix-trial details');
        for(const details of summaries)if(details.querySelector('summary').textContent.startsWith(params.get('checkpoint')+' /'))details.open=true;
      }
      app.querySelector('#matrix-detail').scrollIntoView({block:'start',behavior:'instant'});
    }
  } catch(error) {
    if(location.hash===route)app.innerHTML=`<section class="experiment-page"><h1>Experiment matrix</h1><p role="alert">${esc(error.message)}</p><button id="matrix-retry">Retry</button></section>`;
    document.querySelector('#matrix-retry')?.addEventListener('click',()=>{catalogPromise=null;metadataPromise=null;releases.clear();renderExperiments();});
  }
}
function renderEvidence(cells,problem,sourceCommit){
  const element=document.querySelector('#matrix-detail');
  element.innerHTML=`<div class="matrix-section-title"><h2>Trial evidence</h2></div>${cells.map(cell=>`<article class="matrix-trial"><div class="matrix-trial-title"><h3>${esc(cell.model)} <small>${esc(cell.agent)} ${esc(cell.agent_version)}</small></h3><span>Latest result · ${esc(cell.status)} · ${esc(cell.outcome)}</span>${cell.score_override?.reason==='agent_failure'?'<p class="matrix-muted">Provisional Agent failure: this trial is counted as zero. Original execution states and test evidence are retained below.</p>':''}</div><p class="matrix-muted">Generation <code>${esc(cell.generation.slice(0,24))}</code> · ${cell.attempt_count} attempts · agent invocations ${cell.agent_invocations??'unknown'} · retries ${cell.agent_retries??'unknown'} · ${seconds(cell.wall_seconds_all_attempts)} active wall time<br>Started ${esc(cell.started_at||'unknown')} · Completed ${esc(cell.completed_at||'unknown')}</p><div class="matrix-scroll"><table class="matrix-checkpoints"><thead><tr><th>Checkpoint</th><th>Outcome</th><th>Comparability</th><th>Inference / evaluation</th><th>Official estimate</th><th>Observed responses / tools</th><th>Defects / tags</th></tr></thead><tbody>${cell.checkpoints.map(cp=>`<tr><th>${esc(cp.target_checkpoint)}${cp.target_checkpoint!==cp.checkpoint?`<small>local ${esc(cp.checkpoint)}</small>`:''}</th><td><span class="outcome-${esc(cp.state)}">${esc(isDeliveryFailure(cp)?'Delivery failure':cp.state)}</span>${cp.candidate_failure_reason?`<small>${esc(cp.candidate_failure_reason)}</small>`:''}</td><td>${esc(cp.compatibility.score)}<small>time ${esc(cp.compatibility.time)} · cost ${esc(cp.compatibility.cost)} · calls ${esc(cp.compatibility.calls)}</small></td><td>${seconds(cp.inference_seconds)} / ${seconds(cp.evaluation_seconds)}</td><td>${dollars(cp.official_cost.usd)}<small>${esc(cp.official_cost.coverage)}</small></td><td>${cp.calls.observed_responses??'unknown'} / ${cp.calls.observed_tool_calls??'unknown'}<small>${esc(cp.calls.coverage||'unknown')} · native steps ${cp.native_steps??'unknown'}</small></td><td>${esc(cp.defects.flatMap(d=>d.labels).join(', ')||'unclassified')}<small>${esc(cp.tags.join(', '))}</small></td></tr>`).join('')}</tbody></table></div>${cell.checkpoints.map(cp=>`<details><summary>${esc(cp.target_checkpoint)} / tests and evidence (${cp.tests.length})</summary><p>Candidate <code>${esc(cp.candidate||'unknown')}</code>${cp.candidate_artifact?.path?` · <a href="https://github.com/carterlu0/scbench-rtl-problems/blob/${encodeURIComponent(sourceCommit||'main')}/${cp.candidate_artifact.path.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noreferrer">code archive ↗</a>`:''}</p>${cp.candidate_failure_reason?`<p>Delivery failure: ${esc(cp.candidate_failure_reason)}</p>`:''}${cp.defects.map(d=>`<p>${esc(d.labels.join(', '))} · ${esc(d.reviewer)} · ${esc(d.confidence)}<br>${d.evidence.map(e=>`<code>${esc(e)}</code>`).join('<br>')}</p>`).join('')}<ul>${cp.tests.map(t=>`<li><span class="outcome-${esc(t.status)}">${esc(t.status)}</span> · ${esc(t.group)} · <code>${esc(t.nodeid)}</code></li>`).join('')}</ul></details>`).join('')}</article>`).join('')||'<p>No matching trials.</p>'}`;
}
