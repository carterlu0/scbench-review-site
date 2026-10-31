import {escapeHtml as esc, compareModelSettings} from './experiments-core.mjs?v=20261028-core-alias';

export const primaryLabels = {pipeline_fdr:'FDR',pipeline_cc:'CC',pipeline_fc:'FC',sr_cpr:'CPR'};
const auxiliaryLabels = {
  pipeline_core_pass_rate:'Pipeline Core Pass Rate',sr_core_pass_rate:'SR Core Pass Rate',
  sr_core_completion:'SR Core Completion',sr_regression_failure_rate:'SR Regression Failure Rate ↓',
  pipeline_cpr:'Pipeline CPR (checkpoint mean)',pipeline_trajectory_success_rate:'Pipeline Trajectory Success',
  sr_all_checkpoint_success_rate:'SR All-Checkpoint Success',sr_chain_macro:'SR Chain Macro',
};
const percent = value => value == null ? 'N/A' : `${(100*value).toFixed(2)}%`;
const numeric = value => value == null ? 'N/A' : value.toLocaleString('en-US',{maximumFractionDigits:5});
const titles = {incomplete_results:'Results are incomplete; the frozen denominator is retained',unverified_comparability:'Comparability or formal status is unverified'};
const thresholdLabels = {
  'structure-case': 'Structure-case (recorded)',
  'core-case': 'Core-case (simulated)',
  'strict-case': 'Strict-case (simulated)',
};

function priceRates(report) {
  const rates=report.price_metadata.rates;
  const rows=rates.map(r=>{
    const bounds=rates.filter(t=>t.model===r.model&&t.max_context!=null).map(t=>t.max_context);
    const scope=r.max_context!=null?`prompt input ≤ ${r.max_context.toLocaleString('en-US')} tokens`:
      bounds.length?`prompt input > ${Math.max(...bounds).toLocaleString('en-US')} tokens`:'all prompt lengths';
    return `<p>${esc(r.model)} (${esc(scope)}): input ${r.input}, output ${r.output}, cache read ${r.cache_read??'N/A'}, cache write ${r.cache_write??'N/A'} USD / million tokens · ${esc(r.verified_at)} · ${esc(r.source)}</p>`;
  }).join('');
  return rows+(rates.some(r=>r.max_context!=null)?'<p>Context tiers apply to the entire individual request, including cached prompt input. Complete per-request usage must reconcile with checkpoint totals. Aggregate-only records remain N/A (request_context_required); a large checkpoint total does not establish a long request.</p>':'');
}

function metric(values, unit, eligible) {
  const known=values.filter(value=>typeof value==='number'&&Number.isFinite(value));
  const complete=values.length>0&&known.length===values.length;
  const raw=known.length?known.reduce((sum,value)=>sum+value,0)/known.length:null;
  return {value:eligible&&complete?raw:null,raw_value:raw,known_units:known.length,denominator:values.length,unit,
    reason:eligible&&complete?null:(!complete?'incomplete_results':'unverified_comparability')};
}

function gatePass(row, threshold) {
  const groups=row?.groups||{};
  if(row?.execution_status!=='executed')return false;
  if(threshold==='structure-case')return groups.structure?.all_passed===true;
  if(threshold==='core-case')return groups.structure?.all_passed===true&&groups.core?.all_passed===true;
  return row.strict_pass===1;
}

/** Simulate a stricter progression gate from the recorded Structure-case rows. */
export function simulateThresholdGroup(group, recordsGroup, threshold='structure-case', taskType='') {
  const chains=(group.chains||[]).filter(chain=>!taskType||chain.task_type===taskType);
  const records=recordsGroup?.checkpoint_records||[];
  const fdr=[],cc=[],fc=[];
  for(const chain of chains){
    const rows=records.filter(row=>row.mode==='pipeline'&&row.chain_id===chain.chain_id);
    const byIndex=new Map(rows.map(row=>[row.checkpoint_index,row]));
    const values=[]; let stopped=false; let unknown=false; let final=null;
    for(let index=1;index<=chain.planned_length;index++){
      const row=byIndex.get(index);
      if(stopped){values.push(0);continue;}
      if(!row){unknown=true;values.push(null);continue;}
      if(row.execution_status==='not_reached'){
        // A recorded Structure stop is valid evidence for every stricter gate.
        if(index>1&&values.some(value=>value===0&&stopped)){values.push(0);continue;}
        unknown=true;values.push(null);continue;
      }
      if(row.execution_status!=='executed'||row.strict_pass==null){unknown=true;values.push(null);continue;}
      final=row;
      values.push(row.strict_pass===1?1:0);
      if(!gatePass(row,threshold)){stopped=true;}
    }
    if(unknown){fdr.push(null);cc.push(null);fc.push(null);continue;}
    // The final checkpoint is reached when it was evaluated, even if the
    // selected gate fails there. Its FC contribution is then the recorded
    // partial final-state fraction, while FDR contributes zero.
    const finalReached=final?.checkpoint_index===chain.planned_length;
    fdr.push(finalReached&&final.strict_pass===1?1:0);
    cc.push(values.reduce((sum,value)=>sum+value,0)/chain.planned_length);
    if(!finalReached){fc.push(0);continue;}
    const groups=final.groups||{};
    const structure=groups.structure, core=groups.core, regression=groups.regression;
    fc.push(structure?.all_passed&&core&&regression&&(core.expected+regression.expected)>0
      ?(core.passed+regression.passed)/(core.expected+regression.expected):0);
  }
  const eligible=group.primary?.pipeline_fdr?.value!=null||group.primary?.pipeline_cc?.value!=null;
  return {pipeline_fdr:metric(fdr,'task_chain',eligible),pipeline_cc:metric(cc,'task_chain',eligible),pipeline_fc:metric(fc,'task_chain',eligible),threshold};
}

/** Auxiliary Pipeline analogue of CPR: every planned checkpoint is one unit. */
export function pipelineCheckpointPassRate(group, recordsGroup, taskType='') {
  const chains=(group.chains||[]).filter(chain=>!taskType||chain.task_type===taskType);
  const records=recordsGroup?.checkpoint_records||[];
  const values=[];
  for(const chain of chains){
    const rows=new Map(records.filter(row=>row.mode==='pipeline'&&row.chain_id===chain.chain_id)
      .map(row=>[row.checkpoint_index,row]));
    for(let index=1;index<=chain.planned_length;index++){
      const row=rows.get(index);
      if(!row){values.push(null);continue;}
      if(row.execution_status==='not_reached'){values.push(0);continue;}
      if(row.execution_status!=='executed'||row.strict_pass==null){values.push(null);continue;}
      values.push(row.strict_pass===1?1:0);
    }
  }
  const eligible=group.primary?.pipeline_cc?.value!=null;
  return metric(values,'checkpoint',eligible);
}

export function selectPaperGroups(report,filters={}) {
  return report.groups.filter(g=>['model','agent','prompt_arm'].every(k=>!filters[k]||g.config[k]===filters[k]) &&
    (!filters.scope||(filters.scope==='formal')===g.config.formal) &&
    (!filters.protocol||g.config.protocol===filters.protocol||g.configuration_bindings.some(b=>b.protocol===filters.protocol)))
    .sort((a,b)=>compareModelSettings(a.config,b.config)||a.config.prompt_arm.localeCompare(b.config.prompt_arm)||(a.config.repeat??0)-(b.config.repeat??0));
}
export function displayMetric(metric) {
  if(metric.value!=null)return `<strong>${percent(metric.value)}</strong><small>${metric.known_units}/${metric.denominator} ${esc(metric.unit==='task_chain'?'chains':'checkpoints')}</small>`;
  const diagnostic=metric.raw_value!=null?`<span class="paper-diagnostic">${percent(metric.raw_value)} · raw diagnostic</span>`:'';
  return `<strong>N/A</strong>${diagnostic}<small>${metric.known_units}/${metric.denominator} resolved · ${esc(titles[metric.reason]||metric.reason||'No applicable units')}</small>`;
}
function heading(config) {
  return `${esc(config.model)} · ${esc(config.thinking)}<small>${esc(config.agent)} ${esc(config.agent_version)} · ${esc(config.prompt_arm)} · repeat ${config.repeat??'unknown'}</small>`;
}
function resources(group,policy) {
  return ['pipeline','sr'].map(mode=>{
    const r=group.resources[`${mode}_${policy}`];
    const unit=mode==='pipeline'?'chain':'checkpoint';
    const reasons=Object.entries(r.cost_missing_reasons).map(([k,v])=>`${k}: ${v}`).join('; ');
    return `<tr><th>${heading(group.config)}<small>${mode==='pipeline'?'Pipeline':'SR'}</small></th><td>${numeric(r.total_cost_usd)}<small>USD total</small></td><td>${numeric(r.mean_cost_usd)}<small>USD/${unit} · denominator ${r.denominator}</small></td><td>${numeric(r.mean_time_seconds)}<small>s/${unit} · ${esc(r.timing_policy)}</small></td><td>${r.known_cost_records}/${r.expected_cost_records}<small>${esc(reasons||'Complete cost coverage')}; time ${r.known_time_records}/${r.expected_cost_records}</small></td></tr>`;
  }).join('');
}
function efficiencies(group,policy,performance=group.efficiencies) {
  return Object.entries(primaryLabels).map(([key,label])=>{
    const e=group.efficiencies[`${key}_${policy}`];
    const selected=performance[key];
    const meanCost=group.resources?.[`pipeline_${policy}`]?.mean_cost_usd;
    const meanTime=group.resources?.[`pipeline_${policy}`]?.mean_time_seconds;
    const costEfficiency=selected?.value!=null&&meanCost>0?selected.value/meanCost:e.cost_efficiency_per_usd;
    const timeEfficiency=selected?.value!=null&&meanTime>0?selected.value/(meanTime/3600):e.time_efficiency_per_hour;
    return `<tr><th>${heading(group.config)}<small>${label}: ${percent(selected?.value??e.performance)}</small></th><td>${numeric(costEfficiency)}<small>${esc(e.reason_cost||'per USD')}</small></td><td>${numeric(timeEfficiency)}<small>${esc(e.reason_time||'per hour')}</small></td></tr>`;
  }).join('');
}

export function renderPaperMetrics(report,filters,params,records=null) {
  const groups=selectPaperGroups(report,filters);
  // Show auxiliary benchmark metrics from the main matrix entry point; `aux=0` remains available for
  // a compact primary-only view and the checkbox can toggle them interactively.
  const extra=params.get('aux')!=='0',cost=params.get('overhead')==='1';
  const policy=params.get('cache')==='fixed_85'?'fixed_85':'actual';
  const threshold=thresholdLabels[params.get('threshold')]?params.get('threshold'):'structure-case';
  const recordGroups=new Map((records?.groups||[]).map(group=>[group.id,group]));
  const scope=params.get('task_type')||'';
  const scoreFor=g=>scope?g.by_task_type[scope]:g;
  const scoredFor=g=>{
    const base=scoreFor(g);
    if(!base||threshold==='structure-case')return base;
    const simulated=simulateThresholdGroup(g,recordGroups.get(g.id),threshold,scope);
    return {...base,primary:{...base.primary,...simulated},auxiliary:{...base.auxiliary,pipeline_cpr:pipelineCheckpointPassRate(g,recordGroups.get(g.id),scope)}};
  };
  const withAuxiliary=g=>{const score=scoredFor(g);return score?{...score,auxiliary:{...score.auxiliary,pipeline_cpr:pipelineCheckpointPassRate(g,recordGroups.get(g.id),scope)}}:score;};
  const relevant=groups.filter(g=>scoredFor(g));
  return `<section class="paper-metrics" aria-label="EvoRTL paper metrics">
    <div class="matrix-section-title"><h2>Benchmark performance · FDR / CC / FC / CPR</h2><span>${esc(report.scoring_version)}</span></div>
    ${report.retest?`<p class="matrix-method">Updated evaluation: ${report.retest.completed_jobs}/${report.retest.total_jobs} saved-candidate re-evaluations complete · ${report.retest.agent_invocations} new agent invocations. Historical analysis versions remain available in the selector above.</p>`:''}
    <div class="paper-controls"><label>Progression threshold <select data-paper-select="threshold" aria-label="Pipeline progression threshold">${Object.entries(thresholdLabels).map(([value,label])=>`<option value="${value}" ${threshold===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label><input type="checkbox" data-paper-param="aux" ${extra?'checked':''}> Auxiliary metrics</label><label><input type="checkbox" data-paper-param="overhead" ${cost?'checked':''}> Cost, time & efficiency</label><label>Task type <select data-paper-select="task_type"><option value="">All task chains</option>${['RTL design evolution','test-suite evolution'].map(v=>`<option ${scope===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><button id="paper-csv">Metrics CSV ↗</button><button id="paper-json">Metrics JSON ↗</button></div>
    <div class="matrix-scroll"><table class="matrix-checkpoints paper-primary"><caption class="sr-only">Formal performance metrics, with explicit coverage and unverified raw diagnostics</caption><thead><tr><th>Model / agent / setting</th><th>FDR<small>Pipeline final delivery · chain mean</small></th><th>CC<small>Pipeline completion · chain macro mean</small></th><th>FC<small>Pipeline Final Completion · chain mean</small></th><th>CPR<small>SR strict pass · checkpoint mean</small></th></tr></thead><tbody>${relevant.map(g=>{const score=scoredFor(g);return `<tr><th>${heading(g.config)}<small>${esc(g.config.protocol)}</small></th>${Object.keys(primaryLabels).map(k=>`<td>${displayMetric(score.primary[k])}</td>`).join('')}</tr>`}).join('')||'<tr><td colspan="5">No matching scoring configurations.</td></tr>'}</tbody></table></div>
    <p class="matrix-method">Frozen manifest: ${groups[0]?.coverage.num_chains??'—'} chains / ${groups[0]?.coverage.num_checkpoints??'—'} checkpoints. Current records use Structure-case progression. Core-case and Strict-case are simulations over those same checkpoint results: Core-case stops after the first Structure or Core failure; Strict-case stops after the first strict required-test failure. They do not represent new agent runs or new evidence. FDR, CC and FC are recomputed under the selected threshold; CPR remains the independent SR score. FC scores the preset final checkpoint only: zero if not reached or Structure fails, otherwise the applicable Core + Regression pass fraction.</p>
    ${extra?`<div class="matrix-section-title"><h2>Auxiliary analysis</h2></div><div class="matrix-scroll"><table class="matrix-checkpoints paper-auxiliary"><thead><tr><th>Configuration</th>${Object.values(auxiliaryLabels).map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${relevant.map(g=>{const score=withAuxiliary(g);return `<tr><th>${heading(g.config)}</th>${Object.keys(auxiliaryLabels).map(k=>`<td>${displayMetric(score.auxiliary[k])}</td>`).join('')}</tr>`}).join('')}</tbody></table></div><p class="matrix-method">Pipeline CPR treats all planned Pipeline checkpoints as independent checkpoint units; verified not_reached checkpoints contribute zero. It is an auxiliary checkpoint-weighted view and does not replace chain-weighted CC or independent SR CPR. Core pass rate includes all planned checkpoints; Regression failure rate averages only SR checkpoints with applicable Regression tests. SR Chain Macro aligns the weights with CC; it does not replace CPR.</p><div class="matrix-scroll"><table class="matrix-checkpoints paper-activities"><thead><tr><th>SR primary activity</th><th>Configuration</th><th>CPR / checkpoint coverage</th></tr></thead><tbody>${groups.flatMap(g=>Object.entries(g.sr_by_activity).map(([activity,m])=>`<tr><th>${esc(activity)}</th><td>${heading(g.config)}</td><td>${displayMetric(m)}</td></tr>`)).join('')}</tbody></table></div>`:''}
    ${cost?`<div class="matrix-section-title"><h2>Cost, time & efficiency</h2><label>Input-cache policy <select data-paper-select="cache"><option value="actual" ${policy==='actual'?'selected':''}>Actual recorded cache usage</option><option value="fixed_85" ${policy==='fixed_85'?'selected':''}>Uniform 85% cache-read scenario</option></select></label></div><div class="matrix-scroll"><table class="matrix-checkpoints paper-resources"><thead><tr><th>Configuration / mode</th><th>Total cost</th><th>Mean cost</th><th>Mean time</th><th>Record coverage</th></tr></thead><tbody>${relevant.map(g=>resources({...g,resources:scoreFor(g).resources},policy)).join('')}</tbody></table></div><div class="matrix-scroll paper-efficiency-scroll"><table class="matrix-checkpoints paper-efficiencies"><thead><tr><th>Configuration / performance</th><th>Cost efficiency / USD</th><th>Time efficiency / hour</th></tr></thead><tbody>${relevant.map(g=>{const score=scoredFor(g);return efficiencies({...g,efficiencies:scoreFor(g).efficiencies},policy,score.primary)}).join('')}</tbody></table></div><p class="matrix-method">Price version: ${esc(report.price_version)}. Fixed-price estimates use actual input/output tokens. The 85% scenario prices 85% of total prompt input as cache reads and 15% as uncached input, with no separate cache-write charge; output is unchanged. Reasoning tokens are already included in output. Missing usage or prices remain N/A. FDR, CC and FC share USD/chain and seconds/chain; CPR uses USD/checkpoint and seconds/checkpoint. Failed runs and stop rounds are included; invalid-attempt/retry overhead is retained separately in JSON. Agent time includes tools/self-validation; external evaluation and container/scheduling time are excluded by default. Efficiency is performance divided by mean resource use.</p>`:''}
    <details class="paper-issues"><summary>Scoring coverage, evidence issues & price provenance</summary><p>Benchmark ${esc(report.benchmark_version)} · manifest ${esc(report.manifest_sha256.slice(0,16))}</p>${groups.map(g=>`<p>${heading(g.config)}<br>Pipeline: ${g.coverage.pipeline.num_executed} executed / ${g.coverage.pipeline.num_not_reached} not reached / ${g.coverage.pipeline.num_pending} pending / ${g.coverage.pipeline.num_invalid} invalid. SR: ${g.coverage.sr.num_executed} executed / ${g.coverage.sr.num_pending} pending / ${g.coverage.sr.num_invalid} invalid.</p>${g.issues.length?`<ul>${g.issues.map(i=>`<li>${esc(i.chain_id)} ${esc(i.checkpoint_id)} · ${esc(i.mode)} · ${esc(i.reason)}</li>`).join('')}</ul>`:''}`).join('')}<p>Protocol equivalence is applied only when an explicit manifest mapping matches the hash of every execution setting; original protocol and per-task effective configuration identities are retained. Legacy Functionality is counted as Core exactly once; original evidence is retained. Error tests remain required for strict success. A skipped required test is unexecuted, not passed; applicability must come from frozen task evidence.</p>${priceRates(report)}</details>
  </section>`;
}

export function paperCsv(report,filters,policy='actual',threshold='structure-case',records=null) {
  const headers=['model','agent','agent_version','thinking','prompt_arm','protocol','repeat','metric','value','raw_value','known_units','denominator','unit','reason','cache_policy','threshold_policy','scoring_version','total_cost_usd','mean_cost_usd','total_time_seconds','mean_time_seconds','known_cost_records','expected_cost_records','known_time_records','performance','cost_efficiency_per_usd','time_efficiency_per_second','time_efficiency_per_hour','reason_cost','reason_time'];
  const quote=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';
  const recordGroups=new Map((records?.groups||[]).map(group=>[group.id,group]));
  const rows=selectPaperGroups(report,filters).flatMap(g=>{
    const scope=filters.task_type||'';
    const base=scope?g.by_task_type[scope]:g;
    if(!base)return [];
    const simulated=threshold==='structure-case'||!base?base:simulateThresholdGroup(g,recordGroups.get(g.id),threshold,scope);
    const primary=simulated?{...base.primary,...simulated}:base.primary;
    const auxiliary={...base.auxiliary,pipeline_cpr:pipelineCheckpointPassRate(g,recordGroups.get(g.id),scope)};
    return Object.entries({...primary,...auxiliary,...Object.fromEntries(Object.entries(base.resources).filter(([k])=>k.endsWith(`_${policy}`))),...Object.fromEntries(Object.entries(base.efficiencies).filter(([k])=>k.endsWith(`_${policy}`)))}).map(([metric,m])=>({...g.config,metric,...m,cache_policy:policy,threshold_policy:threshold,scoring_version:report.scoring_version}));
  });
  return [headers,...rows.map(r=>headers.map(k=>r[k]))].map(row=>row.map(quote).join(',')).join('\r\n');
}
