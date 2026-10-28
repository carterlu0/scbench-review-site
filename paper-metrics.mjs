import {escapeHtml as esc, compareModelSettings} from './experiments-core.mjs?v=20261028-core-alias';

export const primaryLabels = {pipeline_fdr:'FDR',pipeline_cc:'CC',pipeline_fc:'FC',sr_cpr:'CPR'};
const auxiliaryLabels = {
  pipeline_core_pass_rate:'Pipeline Core Pass Rate',sr_core_pass_rate:'SR Core Pass Rate',
  sr_core_completion:'SR Core Completion',sr_regression_failure_rate:'SR Regression Failure Rate ↓',
  pipeline_trajectory_success_rate:'Pipeline Trajectory Success',
  sr_all_checkpoint_success_rate:'SR All-Checkpoint Success',sr_chain_macro:'SR Chain Macro',
};
const percent = value => value == null ? 'N/A' : `${(100*value).toFixed(2)}%`;
const numeric = value => value == null ? 'N/A' : value.toLocaleString('en-US',{maximumFractionDigits:5});
const titles = {incomplete_results:'Results are incomplete; the frozen denominator is retained',unverified_comparability:'Comparability or formal status is unverified'};

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
function efficiencies(group,policy) {
  return Object.entries(primaryLabels).map(([key,label])=>{
    const e=group.efficiencies[`${key}_${policy}`];
    return `<tr><th>${heading(group.config)}<small>${label}: ${percent(e.performance)}</small></th><td>${numeric(e.cost_efficiency_per_usd)}<small>${esc(e.reason_cost||'per USD')}</small></td><td>${numeric(e.time_efficiency_per_hour)}<small>${esc(e.reason_time||'per hour')}</small></td></tr>`;
  }).join('');
}

export function renderPaperMetrics(report,filters,params) {
  const groups=selectPaperGroups(report,filters);
  const extra=params.get('aux')==='1',cost=params.get('overhead')==='1';
  const policy=params.get('cache')==='fixed_85'?'fixed_85':'actual';
  const scope=params.get('task_type')||'';
  const scoreFor=g=>scope?g.by_task_type[scope]:g;
  const relevant=groups.filter(g=>scoreFor(g));
  return `<section class="paper-metrics" aria-label="EvoRTL paper metrics">
    <div class="matrix-section-title"><h2>Benchmark performance · FDR / CC / FC / CPR</h2><span>${esc(report.scoring_version)}</span></div>
    <div class="paper-controls"><label><input type="checkbox" data-paper-param="aux" ${extra?'checked':''}> Auxiliary metrics</label><label><input type="checkbox" data-paper-param="overhead" ${cost?'checked':''}> Cost, time & efficiency</label><label>Task type <select data-paper-select="task_type"><option value="">All task chains</option>${['RTL design evolution','test-suite evolution'].map(v=>`<option ${scope===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><button id="paper-csv">Metrics CSV ↗</button><button id="paper-json">Metrics JSON ↗</button></div>
    <div class="matrix-scroll"><table class="matrix-checkpoints paper-primary"><caption class="sr-only">Formal performance metrics, with explicit coverage and unverified raw diagnostics</caption><thead><tr><th>Model / agent / setting</th><th>FDR<small>Pipeline final delivery · chain mean</small></th><th>CC<small>Pipeline completion · chain macro mean</small></th><th>FC<small>Pipeline Final Completion · chain mean</small></th><th>CPR<small>SR strict pass · checkpoint mean</small></th></tr></thead><tbody>${relevant.map(g=>`<tr><th>${heading(g.config)}<small>${esc(g.config.protocol)}</small></th>${Object.keys(primaryLabels).map(k=>`<td>${displayMetric(scoreFor(g).primary[k])}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="5">No matching scoring configurations.</td></tr>'}</tbody></table></div>
    <p class="matrix-method">Frozen manifest: ${groups[0]?.coverage.num_chains??'—'} chains / ${groups[0]?.coverage.num_checkpoints??'—'} checkpoints. All scheduled targets remain in their denominators; pending and invalid results remain N/A. Verified Structure stops score zero without invented test failures. Full metrics require formal, compatible evidence. FC scores the preset final checkpoint only: zero if not reached or Structure fails, otherwise the applicable Core + Regression pass fraction; earlier checkpoint successes do not enter FC. Raw diagnostic values are labelled separately. These benchmark scores use the entire frozen task set, including when searching or viewing a problem; task-type selection explicitly changes the scope.</p>
    ${extra?`<div class="matrix-section-title"><h2>Auxiliary analysis</h2></div><div class="matrix-scroll"><table class="matrix-checkpoints paper-auxiliary"><thead><tr><th>Configuration</th>${Object.values(auxiliaryLabels).map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${relevant.map(g=>`<tr><th>${heading(g.config)}</th>${Object.keys(auxiliaryLabels).map(k=>`<td>${displayMetric(scoreFor(g).auxiliary[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="matrix-method">Core pass rate includes all planned checkpoints; Pipeline not_reached contributes zero. Regression failure rate averages only SR checkpoints with applicable Regression tests. SR Chain Macro aligns the weights with CC; it does not replace CPR.</p><div class="matrix-scroll"><table class="matrix-checkpoints paper-activities"><thead><tr><th>SR primary activity</th><th>Configuration</th><th>CPR / checkpoint coverage</th></tr></thead><tbody>${groups.flatMap(g=>Object.entries(g.sr_by_activity).map(([activity,m])=>`<tr><th>${esc(activity)}</th><td>${heading(g.config)}</td><td>${displayMetric(m)}</td></tr>`)).join('')}</tbody></table></div>`:''}
    ${cost?`<div class="matrix-section-title"><h2>Cost, time & efficiency</h2><label>Input-cache policy <select data-paper-select="cache"><option value="actual" ${policy==='actual'?'selected':''}>Actual recorded cache usage</option><option value="fixed_85" ${policy==='fixed_85'?'selected':''}>Uniform 85% cache-read scenario</option></select></label></div><div class="matrix-scroll"><table class="matrix-checkpoints paper-resources"><thead><tr><th>Configuration / mode</th><th>Total cost</th><th>Mean cost</th><th>Mean time</th><th>Record coverage</th></tr></thead><tbody>${relevant.map(g=>resources({...g,resources:scoreFor(g).resources},policy)).join('')}</tbody></table></div><div class="matrix-scroll paper-efficiency-scroll"><table class="matrix-checkpoints paper-efficiencies"><thead><tr><th>Configuration / performance</th><th>Cost efficiency / USD</th><th>Time efficiency / hour</th></tr></thead><tbody>${relevant.map(g=>efficiencies({...g,efficiencies:scoreFor(g).efficiencies},policy)).join('')}</tbody></table></div><p class="matrix-method">Price version: ${esc(report.price_version)}. Fixed-price estimates use actual input/output tokens. The 85% scenario prices 85% of total prompt input as cache reads and 15% as uncached input, with no separate cache-write charge; output is unchanged. Reasoning tokens are already included in output. Missing usage or prices remain N/A. FDR, CC and FC share USD/chain and seconds/chain; CPR uses USD/checkpoint and seconds/checkpoint. Failed runs and stop rounds are included; invalid-attempt/retry overhead is retained separately in JSON. Agent time includes tools/self-validation; external evaluation and container/scheduling time are excluded by default. Efficiency is performance divided by mean resource use.</p>`:''}
    <details class="paper-issues"><summary>Scoring coverage, evidence issues & price provenance</summary><p>Benchmark ${esc(report.benchmark_version)} · manifest ${esc(report.manifest_sha256.slice(0,16))}</p>${groups.map(g=>`<p>${heading(g.config)}<br>Pipeline: ${g.coverage.pipeline.num_executed} executed / ${g.coverage.pipeline.num_not_reached} not reached / ${g.coverage.pipeline.num_pending} pending / ${g.coverage.pipeline.num_invalid} invalid. SR: ${g.coverage.sr.num_executed} executed / ${g.coverage.sr.num_pending} pending / ${g.coverage.sr.num_invalid} invalid.</p>${g.issues.length?`<ul>${g.issues.map(i=>`<li>${esc(i.chain_id)} ${esc(i.checkpoint_id)} · ${esc(i.mode)} · ${esc(i.reason)}</li>`).join('')}</ul>`:''}`).join('')}<p>Protocol equivalence is applied only when an explicit manifest mapping matches the hash of every execution setting; original protocol and per-task effective configuration identities are retained. Legacy Functionality is counted as Core exactly once; original evidence is retained. Error tests remain required for strict success. A skipped required test is unexecuted, not passed; applicability must come from frozen task evidence.</p>${report.price_metadata.rates.map(r=>`<p>${esc(r.model)}: input ${r.input}, output ${r.output}, cache read ${r.cache_read??'N/A'}, cache write ${r.cache_write??'N/A'} USD / million tokens · ${esc(r.verified_at)} · ${esc(r.source)}</p>`).join('')}</details>
  </section>`;
}

export function paperCsv(report,filters,policy='actual') {
  const headers=['model','agent','agent_version','thinking','prompt_arm','protocol','repeat','metric','value','raw_value','known_units','denominator','unit','reason','cache_policy','scoring_version','total_cost_usd','mean_cost_usd','total_time_seconds','mean_time_seconds','known_cost_records','expected_cost_records','known_time_records','performance','cost_efficiency_per_usd','time_efficiency_per_second','time_efficiency_per_hour','reason_cost','reason_time'];
  const quote=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';
  const rows=selectPaperGroups(report,filters).flatMap(g=>Object.entries({...g.primary,...g.auxiliary,...Object.fromEntries(Object.entries(g.resources).filter(([k])=>k.endsWith(`_${policy}`))),...Object.fromEntries(Object.entries(g.efficiencies).filter(([k])=>k.endsWith(`_${policy}`)))}).map(([metric,m])=>({...g.config,metric,...m,cache_policy:policy,scoring_version:report.scoring_version})));
  return [headers,...rows.map(r=>headers.map(k=>r[k]))].map(row=>row.map(quote).join(',')).join('\r\n');
}
