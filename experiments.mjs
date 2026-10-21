import {escapeHtml as esc, groupKey, selectCells, summarize, csv} from './experiments-core.mjs';
let catalogPromise;
const releases = new Map();
const percent = n => n == null ? '—' : `${(n*100).toFixed(0)}%`;
const dollars = n => n == null ? 'unknown' : `$${n.toFixed(3)}`;
const seconds = n => n == null ? '—' : `${Math.round(n)}s`;
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
export async function renderExperiments() {
  const route = location.hash;
  if (!route.startsWith('#experiments')) return;
  const app = document.querySelector('#app');
  const params = new URLSearchParams(route.split('?')[1] || '');
  app.innerHTML = '<section class="experiment-page"><p role="status">Loading experiment matrix…</p></section>';
  try {
    catalogPromise ||= json('data/experiments/catalog.json');
    const catalog = await catalogPromise;
    if(location.hash!==route)return;
    if(!catalog.releases?.length) {
      app.innerHTML='<section class="experiment-page"><p class="eyebrow">EXPERIMENTS</p><h1>Experiment matrix</h1><p>No experiment analyses have been published yet.</p><a href="#problems">Browse problems →</a></section>';return;
    }
    // Explicit publication default; trial selection never uses best/latest results.
    const entry = catalog.releases.find(r=>r.id===params.get('analysis')) || catalog.releases.find(r=>r.id===catalog.default_analysis) || catalog.releases[0];
    if(!releases.has(entry.id)) releases.set(entry.id, json(`data/experiments/${entry.path}`));
    const release = await releases.get(entry.id);
    if(location.hash!==route)return;
    const filters={mode:params.get('mode')||'',prompt_arm:params.get('prompt_arm')||'',protocol:params.get('protocol')||'',scope:params.get('scope')||'diagnostic',q:params.get('q')||'',model:params.get('model')||'',agent:params.get('agent')||''};
    if(!params.has('scope') && release.cells.some(c=>c.formal))filters.scope='formal';
    const protocols=[...new Set(release.cells.map(c=>c.protocol))];
    if(!filters.protocol && protocols.length===1)filters.protocol=protocols[0];
    const arms=[...new Set(release.cells.map(c=>c.prompt_arm))];
    if(!filters.prompt_arm && arms.length===1)filters.prompt_arm=arms[0];
    const cells=selectCells(release,filters);
    const metric=params.get('metric')||'score';
    const groups=new Map();
    for(const cell of cells){const key=groupKey(cell);if(!groups.has(key))groups.set(key,cell);}
    const columns=[...groups.entries()].sort((a,b)=>cells.filter(c=>groupKey(c)===b[0]).length-cells.filter(c=>groupKey(c)===a[0]).length||a[1].model.localeCompare(b[1].model));
    const problems=[...new Set(cells.map(c=>c.problem))].sort();
    const selectedProblem=params.get('problem');
    const total=summarize(cells);
    app.innerHTML=`<section class="experiment-page">
      <div class="matrix-heading"><div><p class="eyebrow">SCBENCH / EXPERIMENTS</p><h1>Experiment matrix<span class="matrix-dot">.</span></h1><p class="matrix-subtitle">${esc(release.name)} · ${problems.length} problems · ${columns.length} model / agent configurations</p></div><div class="matrix-actions"><button id="matrix-csv">Export CSV ↗</button><button id="matrix-json">JSON ↗</button></div></div>
      <div class="matrix-provenance"><span>Analysis <code>${esc(entry.id.slice(0,12))}</code></span><span>Source <code>${esc((catalog.source?.commit||'local').slice(0,12))}</code></span><span>Pricebook <code>${esc((release.pricebook||'unknown').slice(0,12))}</code></span><span>${esc(release.created_at.slice(0,10))}</span></div>
      <form id="matrix-filters" class="matrix-filters">
        <label>Analysis<select name="analysis">${catalog.releases.map(r=>`<option value="${esc(r.id)}" ${r.id===entry.id?'selected':''}>${esc(r.name)} · ${esc(r.id.slice(0,8))}</option>`).join('')}</select></label>
        <label>Protocol<select name="protocol">${options(protocols,filters.protocol,'All (separate columns)')}</select></label>
        <label>Metric<select name="metric">${options(['score','time','cost','calls'],metric)}</select></label>
        <label>Model<select name="model">${options(release.cells.map(c=>c.model),filters.model,'All models')}</select></label>
        <label>Agent<select name="agent">${options(release.cells.map(c=>c.agent),filters.agent,'All agents')}</select></label>
        <label>Mode<select name="mode">${options(release.cells.map(c=>c.mode),filters.mode,'All modes')}</select></label>
        <label>Prompt arm<select name="prompt_arm">${options(arms,filters.prompt_arm,'All (separate rows)')}</select></label>
        <label>Scope<select name="scope"><option value="formal" ${filters.scope==='formal'?'selected':''}>Formal</option><option value="diagnostic" ${filters.scope==='diagnostic'?'selected':''}>Historical / diagnostic</option></select></label>
        <label class="matrix-search">Find problem<input name="q" value="${esc(filters.q)}" placeholder="Search by name" /></label><button type="submit">Apply</button>
      </form>
      <div class="matrix-kpis"><div><span>Planned trials</span><strong>${total.planned}</strong></div><div><span>Comparable trials</span><strong>${total.valid}<small> / ${total.planned}</small></strong></div><div><span>Known outcomes</span><strong>${cells.reduce((s,c)=>s+c.checkpoints.filter(cp=>['passed','failed'].includes(cp.state)).length,0)}</strong></div><div><span>Official price estimate</span><strong>${dollars(total.cost)}</strong><small>All attempts · ${total.cost==null?'incomplete coverage':'USD'}</small></div></div>
      <div class="matrix-section-title"><h2>Problem × model / agent</h2><span>Click a cell to inspect checkpoints</span></div>
      <div class="matrix-scroll" tabindex="0" role="region" aria-label="Experiment results matrix"><table class="experiment-matrix"><caption class="sr-only">Comparable scores; historical observations are marked separately. Unrun and infrastructure errors remain unscored.</caption><thead><tr><th scope="col">Problem / experiment arm</th>${columns.map(([,c])=>`<th scope="col"><span>${esc(c.model)}</span><small>${esc(c.agent)} ${esc(c.agent_version)} · ${esc(c.thinking)}</small><small>config ${esc(c.agent_config.slice(0,6))} · protocol ${esc(c.protocol.slice(0,6))}</small></th>`).join('')}</tr></thead><tbody>
      ${problems.flatMap(problem=>[...new Set(cells.filter(c=>c.problem===problem).map(c=>`${c.mode}|${c.prompt_arm}`))].sort().map(arm=>`<tr><th scope="row"><a href="${problemHash(problem,entry.id,filters)}">${esc(problem)}</a><small>${esc(arm.replace('|',' / '))}</small></th>${columns.map(([key])=>{
        const matches=cells.filter(c=>c.problem===problem&&groupKey(c)===key&&`${c.mode}|${c.prompt_arm}`===arm);if(!matches.length)return '<td class="matrix-empty">—</td>';
        const s=summarize(matches);const value=s.score??s.observed;const cls=metric==='score'?(s.score!=null?(value===1?'pass':value===0?'fail':'partial'):s.incomplete?'pending':'observed'):'observed';let label=percent(value);if(metric==='time')label=matches.every(c=>c.wall_seconds_all_attempts!=null)?seconds(matches.reduce((sum,c)=>sum+c.wall_seconds_all_attempts,0)):'unknown';if(metric==='cost')label=dollars(s.cost);if(metric==='calls'){const cp=matches.flatMap(c=>c.checkpoints);label=cp.length&&cp.every(c=>c.calls.observed_responses!=null)?String(cp.reduce((sum,c)=>sum+c.calls.observed_responses,0)):'unknown';}
        return `<td><button class="matrix-cell ${cls}" data-problem="${esc(problem)}" data-column="${esc(key)}" aria-label="Inspect ${esc(problem)} ${esc(matches[0].model)}"><strong>${label}</strong><span>${metric==='score'?(s.score!=null?'comparable':s.incomplete?'incomplete':'observed · unverified'):metric==='calls'?'observed responses · lower bound':metric==='cost'?'USD · all attempts':'seconds · all attempts'}</span><small>${s.valid}/${s.planned} comparable · ${s.attempts} attempts</small></button></td>`;
      }).join('')}</tr>`)).join('') || `<tr><td colspan="${columns.length+1}">No trials match these filters.</td></tr>`}</tbody></table></div>
      <p class="matrix-method">Formal totals require every planned trial and a compatible input version. Historical percentages describe observed checkpoints; they are excluded from formal scores. Missing trials and infrastructure errors stay unscored. Columns keep agent versions, settings and protocols separate.</p>
      <section id="matrix-detail" class="matrix-detail" aria-live="polite"></section>
      <div class="matrix-bottom"><section><h2>Implementation defects · full analysis</h2><p>Candidate defects are independent of the problem’s four-dimensional attribution.</p>${Object.keys(release.implementation_defects).length?`<dl>${Object.entries(release.implementation_defects).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${v} events</dd></div>`).join('')}</dl>`:'<p class="matrix-muted">No reviewed defect events in this analysis.</p>'}</section><section><h2>Annotation coverage · full analysis</h2><p>Revision-bound annotations also apply to matching historical records.</p><dl>${Object.entries(release.annotation_coverage).map(([k,v])=>`<div><dt>${esc(k.replaceAll('_',' '))}</dt><dd>${v}</dd></div>`).join('')||'<p class="matrix-muted">No classified test records.</p>'}</dl></section></div>
    </section>`;
    app.querySelector('#matrix-filters').addEventListener('submit',event=>{event.preventDefault();const next=new URLSearchParams(new FormData(event.currentTarget));location.hash=`experiments?${next}`;});
    app.querySelector('#matrix-filters select[name="analysis"]').addEventListener('change',event=>{location.hash=`experiments?analysis=${encodeURIComponent(event.target.value)}`;});
    app.querySelector('#matrix-csv').onclick=()=>download('scbench-experiments.csv',csv(cells),'text/csv;charset=utf-8');
    app.querySelector('#matrix-json').onclick=()=>download('scbench-experiments.json',JSON.stringify({...release,cells},null,2),'application/json');
    app.querySelectorAll('[data-problem]').forEach(button=>button.onclick=()=>{
      const next=new URLSearchParams(params);next.set('analysis',entry.id);next.set('problem',button.dataset.problem);next.set('column',button.dataset.column);location.hash=`experiments?${next}`;
    });
    if(selectedProblem){
      let detailCells=cells;
      const detailPath=release.detail_paths?.[selectedProblem];
      if(detailPath){const detail=await json(`data/experiments/${detailPath}`);if(location.hash!==route)return;const visible=new Set(cells.map(c=>c.id));detailCells=detail.cells.filter(c=>visible.has(c.id));}
      renderDetail(detailCells.filter(c=>c.problem===selectedProblem&&(!params.get('column')||groupKey(c)===params.get('column'))),selectedProblem,catalog.source?.commit);
    }
  }catch(error){if(location.hash===route)app.innerHTML=`<section class="experiment-page"><h1>Experiment matrix</h1><p role="alert">${esc(error.message)}</p><button id="matrix-retry">Retry</button></section>`;document.querySelector('#matrix-retry')?.addEventListener('click',()=>{catalogPromise=null;releases.clear();renderExperiments();});}
}
function problemHash(problem,id,filters){return `#experiments?${new URLSearchParams({...filters,analysis:id,problem})}`;}
function renderDetail(cells,problem,sourceCommit){
  const element=document.querySelector('#matrix-detail');
  const nodes=[...new Set(cells.flatMap(c=>c.checkpoints.map(cp=>cp.target_checkpoint)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const heatmap=`<div class="matrix-scroll"><table class="experiment-matrix"><caption class="sr-only">Checkpoint by model, agent and independent trial</caption><thead><tr><th>Checkpoint</th>${cells.map(c=>`<th>${esc(c.model)}<small>${esc(c.agent)} ${esc(c.agent_version)} · trial ${c.repeat+1}</small></th>`).join('')}</tr></thead><tbody>${nodes.map(node=>`<tr><th>${esc(node)}</th>${cells.map(c=>{const cp=c.checkpoints.find(cp=>cp.target_checkpoint===node);return `<td><span class="outcome-${esc(cp?.state||'missing')}">${esc(cp?.state||'not planned')}</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  element.innerHTML=`<div class="matrix-section-title"><h2>${esc(problem)} / checkpoint details</h2><a href="#experiments">Close ×</a></div>${heatmap}${cells.map(cell=>`<article class="matrix-trial"><div class="matrix-trial-title"><h3>${esc(cell.model)} <small>${esc(cell.agent)} ${esc(cell.agent_version)}</small></h3><span>repeat ${cell.repeat+1} · ${esc(cell.status)} · ${esc(cell.outcome)}</span></div><p class="matrix-muted">Generation <code>${esc(cell.generation.slice(0,24))}</code> · ${cell.attempt_count} attempts · agent invocations ${cell.agent_invocations??'unknown'} · retries ${cell.agent_retries??'unknown'} · ${seconds(cell.wall_seconds_all_attempts)} active wall time<br>Started ${esc(cell.started_at||'unknown')} · Completed ${esc(cell.completed_at||'unknown')}</p><div class="matrix-scroll"><table class="matrix-checkpoints"><thead><tr><th>Checkpoint</th><th>Outcome</th><th>Comparability</th><th>Inference / evaluation</th><th>Official estimate</th><th>Observed responses / tools</th><th>Defects / tags</th></tr></thead><tbody>${cell.checkpoints.map(cp=>`<tr><th>${esc(cp.target_checkpoint)}${cp.target_checkpoint!==cp.checkpoint?`<small>local ${esc(cp.checkpoint)}</small>`:''}</th><td><span class="outcome-${esc(cp.state)}">${esc(cp.state)}</span></td><td>${esc(cp.compatibility.score)}<small>time ${esc(cp.compatibility.time)} · cost ${esc(cp.compatibility.cost)} · calls ${esc(cp.compatibility.calls)}</small></td><td>${seconds(cp.inference_seconds)} / ${seconds(cp.evaluation_seconds)}</td><td>${dollars(cp.official_cost.usd)}<small>${esc(cp.official_cost.coverage)}</small></td><td>${cp.calls.observed_responses??'unknown'} / ${cp.calls.observed_tool_calls??'unknown'}<small>${esc(cp.calls.coverage||'unknown')} · native steps ${cp.native_steps??'unknown'}</small></td><td>${esc(cp.defects.flatMap(d=>d.labels).join(', ')||'unclassified')}<small>${esc(cp.tags.join(', '))}</small></td></tr>`).join('')}</tbody></table></div>${cell.checkpoints.map(cp=>`<details><summary>${esc(cp.target_checkpoint)} / tests and evidence (${cp.tests.length})</summary><p>Candidate <code>${esc(cp.candidate||'unknown')}</code>${cp.candidate_artifact?.path?` · <a href="https://github.com/carterlu0/scbench-rtl-problems/blob/${encodeURIComponent(sourceCommit||'main')}/${cp.candidate_artifact.path.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noreferrer">code archive ↗</a>`:''}</p>${cp.defects.map(d=>`<p>${esc(d.labels.join(', '))} · ${esc(d.reviewer)} · ${esc(d.confidence)}<br>${d.evidence.map(e=>`<code>${esc(e)}</code>`).join('<br>')}</p>`).join('')}<ul>${cp.tests.map(t=>`<li><span class="outcome-${esc(t.status)}">${esc(t.status)}</span> · ${esc(t.group)} · <code>${esc(t.nodeid)}</code></li>`).join('')}</ul></details>`).join('')}</article>`).join('')||'<p>No matching trials.</p>'}`;
}
