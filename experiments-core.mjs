export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const groupKey = cell => JSON.stringify([cell.model, cell.agent, cell.agent_version, cell.agent_config, cell.thinking, cell.protocol]);
// Environment-bound configuration hashes identify trials, not model columns.
// Keep them in resultKey for exact latest-trial selection and evidence.
export const modelKey = cell => JSON.stringify([cell.model, cell.agent, cell.agent_version, cell.thinking]);
export function compareModelSettings(a, b) {
  for (const field of ['model', 'agent', 'agent_version']) {
    const order = String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
    if (order) return order;
  }
  const efforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  const left = efforts.indexOf(a.thinking), right = efforts.indexOf(b.thinking);
  return left >= 0 && right >= 0 ? left - right : String(a.thinking ?? '').localeCompare(String(b.thinking ?? ''));
}
export const resultKey = cell => JSON.stringify([cell.problem, cell.mode, cell.prompt_arm, groupKey(cell), cell.mode === 'sr' ? plannedTargets(cell) : null]);

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return -Infinity;
  // Legacy timestamps have no zone. Normalize consistently in every browser.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : -Infinity;
}

export function latestCells(cells) {
  const selected = new Map();
  const start = cell => {
    const time = timestamp(cell.started_at);
    if (time !== -Infinity) return time;
    const checkpointStarts = (cell.checkpoints || []).map(cp => timestamp(cp.started_at)).filter(t => t !== -Infinity);
    return checkpointStarts.length ? Math.min(...checkpointStarts) : timestamp(cell.completed_at);
  };
  const newer = (a, b) => {
    if (start(a) !== start(b)) return start(a) > start(b);
    const aEnd = timestamp(a.completed_at), bEnd = timestamp(b.completed_at);
    if (aEnd !== bEnd) return aEnd > bEnd;
    return String(a.id) > String(b.id);
  };
  for (const cell of cells) {
    const key = resultKey(cell);
    if (!selected.has(key) || newer(cell, selected.get(key))) selected.set(key, cell);
  }
  return [...selected.values()];
}
export function selectCells(release, filters) {
  return release.cells.filter(cell => ['mode', 'prompt_arm', 'protocol', 'model', 'agent'].every(key => !filters[key] || cell[key] === filters[key]) &&
    (!filters.scope || (filters.scope === 'formal') === cell.formal) &&
    (!filters.q || cell.problem.toLowerCase().includes(filters.q.toLowerCase())));
}
export function summarize(cells) {
  const valid = cells.filter(c => typeof c.score === 'number');
  const observed = cells.flatMap(c => c.checkpoints).filter(c => ['passed', 'failed'].includes(c.state));
  return {planned: cells.length, valid: valid.length,
    score: valid.length === cells.length && valid.length ? valid.reduce((sum,c) => sum+c.score,0)/valid.length : null,
    observed: observed.length ? observed.filter(c=>c.state==='passed').length/observed.length : null,
    attempts: cells.reduce((sum,c)=>sum+c.attempt_count,0),
    cost: cells.length && cells.every(c=>c.official_cost_all_attempts != null) ? cells.reduce((sum,c)=>sum+c.official_cost_all_attempts,0) : null,
    incomplete: cells.some(c=>c.status !== 'completed'),
    incompatible: cells.some(c=>c.checkpoints.some(cp=>!['identical','compatible'].includes(cp.compatibility?.score)))};
}
export function csv(cells) {
  const headers = ['problem','model','agent','agent_version','thinking','mode','prompt_arm','repeat','status','outcome','score','progression_policy','final_checkpoint','final_passed_tests','final_total_tests','final_result_reason','official_cost_all_attempts','cost_coverage','agent_invocations','agent_retries'];
  const quote = value => {let text=String(value ?? ''); if (/^[=+@\-]/.test(text)) text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [headers,...cells.map(c=>{const result=finalResult(c,cells);const row={...c,final_checkpoint:result.target,final_passed_tests:result.passed,final_total_tests:result.total,final_result_reason:result.reason};return headers.map(h=>row[h]);})].map(row=>row.map(quote).join(',')).join('\r\n');
}

const checkpointOrder = (a, b) => a.localeCompare(b, undefined, {numeric: true});
const validCount = value => Number.isInteger(value) && value >= 0;
export function testCounts(checkpoint, group = 'total') {
  if (!checkpoint) return null;
  const key = group.toLowerCase() === 'functionality' ? 'core' : group.toLowerCase();
  if (checkpoint.score_override?.value === 0 && checkpoint.score_override.reason === 'agent_failure') {
    const expected = checkpoint.expected_test_counts;
    const total = key === 'total' ? expected?.total : key === 'core' && expected?.groups
      ? (expected.groups.core || 0) + (expected.groups.functionality || 0) : expected?.groups?.[key];
    if (validCount(total)) return {passed: 0, total};
    // Retain the recorded nodes and verdicts; only the counted score is overridden.
    const original = testCounts({...checkpoint, score_override: null}, group);
    return original ? {...original, passed: 0} : null;
  }
  const saved = checkpoint.test_counts?.[key];
  if (key === 'core' && checkpoint.test_counts?.functionality != null) {
    const legacy = checkpoint.test_counts.functionality;
    if ([saved, legacy].every(v => v && validCount(v.passed) && validCount(v.total) && v.passed <= v.total)) {
      return {passed: saved.passed + legacy.passed, total: saved.total + legacy.total};
    }
    if (!checkpoint.tests?.length) return null;
  }
  if (!(key === 'core' && checkpoint.test_counts?.functionality != null) && saved && validCount(saved.passed) && validCount(saved.total) && saved.passed <= saved.total) return saved;
  // Overview records omit nodes. An empty lazy payload does not mean zero tests.
  if (!checkpoint.tests?.length) return null;
  const tests = group === 'total' ? checkpoint.tests : checkpoint.tests.filter(t => (t.group.toLowerCase() === 'functionality' ? 'core' : t.group.toLowerCase()) === key);
  return {passed: tests.filter(t => t.status === 'passed').length, total: tests.length};
}

export function plannedTargets(cell) {
  if (cell.planned_targets?.length) return [...new Set(cell.planned_targets)].sort(checkpointOrder);
  if (cell.mode === 'pipeline' && cell.planned_checkpoints) return Array.from({length: cell.planned_checkpoints}, (_, i) => `checkpoint_${i + 1}`);
  return [...new Set(cell.checkpoints.map(cp => cp.target_checkpoint))].sort(checkpointOrder);
}

export function checkpointRows(cells) {
  const targets = [...new Set(cells.flatMap(plannedTargets))].sort(checkpointOrder);
  return targets.flatMap(target => ['pipeline', 'sr'].map(mode => ({target, mode, label: mode === 'pipeline' ? `pipeline c${target.replace('checkpoint_', '')}` : `sr${target.replace('checkpoint_', '')}`})));
}

function rawCounts(cp) {
  const evaluation = cp.evaluation;
  if (evaluation?.infrastructure_failure || evaluation?.details?.infrastructure_failure) return null;
  const counts = {};
  for (const group of ['structure', 'core', 'functionality', 'regression', 'error']) {
    const pair = evaluation?.counts?.[group];
    const summary = cp.run_result;
    const passed = pair?.[0] ?? summary?.[`${group}_passed`];
    const total = pair?.[1] ?? summary?.[`${group}_total`];
    if (validCount(passed) && validCount(total) && passed <= total) counts[group] = {passed, total};
  }
  const summary = cp.run_result;
  if (validCount(summary?.passed_tests) && validCount(summary?.total_tests) && summary.passed_tests <= summary.total_tests) {
    counts.total = {passed: summary.passed_tests, total: summary.total_tests};
  } else if (Object.keys(counts).length === 5) {
    counts.total = Object.values(counts).reduce((sum, value) => ({passed: sum.passed + value.passed, total: sum.total + value.total}), {passed: 0, total: 0});
  }
  return Object.keys(counts).length ? counts : null;
}

// Old analyses omit group totals and progression policy. Join only the exact
// published run URL, checkpoint and candidate; never match by model or newest run.
export function hydrateCells(cells, problems, protocols = {}) {
  const runs = new Map();
  for (const problem of problems) for (const run of problem.evaluationRuns || []) {
    if (!run.sourcePath) continue;
    if (runs.has(run.sourcePath)) runs.set(run.sourcePath, null);
    else runs.set(run.sourcePath, run);
  }
  return cells.map(cell => {
    const raw = runs.get(cell.legacy_origin?.source_url);
    const result = {...cell, progression_policy: cell.progression_policy || protocols[cell.protocol]?.parameters?.pass_policy || 'unknown'};
    if (raw) {
      result.progression_policy = raw.publication_provenance?.actual_pass_policy || raw.pass_policy || result.progression_policy;
      if (cell.mode === 'pipeline' && validCount(raw.expected_checkpoints) && raw.expected_checkpoints > 0) {
        result.planned_checkpoints = raw.expected_checkpoints;
        result.planned_targets = Array.from({length: raw.expected_checkpoints}, (_, i) => `checkpoint_${i + 1}`);
      }
    }
    result.checkpoints = cell.checkpoints.map(cp => {
      const source = raw?.checkpoints?.find(item => item.checkpoint === cp.checkpoint);
      const candidate = source?.code_snapshot?.tree_sha256;
      if (!source || !candidate || candidate !== cp.candidate) return cp;
      if (source.evaluation?.infrastructure_failure || source.evaluation?.details?.infrastructure_failure) return {...cp,state:'evaluation_error',test_counts:null};
      return {...cp, test_counts: cp.test_counts || rawCounts(source)};
    });
    return result;
  });
}

export function isDeliveryFailure(checkpoint) {
  return checkpoint?.state === 'failed' && (checkpoint.candidate_failure === 'delivery_failure' ||
    checkpoint.defects?.some(defect => ['reviewed', 'confirmed'].includes(defect.confidence) && defect.labels?.includes('delivery_failure')) || false);
}

export function finalResult(cell, peers = []) {
  const unknown = reason => ({passed: null, total: null, reason});
  if (cell.mode !== 'pipeline') return unknown('not_pipeline');
  if (cell.progression_policy !== 'structure-cases') return unknown(cell.progression_policy === 'unknown' || !cell.progression_policy ? 'policy_unknown' : 'other_policy');
  const target = plannedTargets(cell).at(-1);
  const final = cell.checkpoints.find(cp => cp.target_checkpoint === target);
  if (cell.score_override?.value === 0 && cell.score_override.reason === 'agent_failure') {
    const total = cell.expected_test_counts?.[target]?.total ?? testCounts(final)?.total;
    return {passed: 0, total: validCount(total) ? total : null, target, reason: 'agent_failure'};
  }
  const counts = testCounts(final);
  if (counts?.total > 0 && ['passed', 'failed'].includes(final.state)) return {...counts, target, reason: isDeliveryFailure(final) ? 'delivery_failure' : 'evaluated'};
  const lastEvaluated = [...cell.checkpoints].filter(cp => ['passed', 'failed'].includes(cp.state)).sort((a,b) => checkpointOrder(a.target_checkpoint,b.target_checkpoint)).at(-1);
  const structure = testCounts(lastEvaluated, 'structure');
  const failedStructure = structure?.total > 0 && structure.passed < structure.total;
  const delivery = isDeliveryFailure(lastEvaluated);
  const stopped = cell.outcome === 'failed' && (failedStructure || delivery) && lastEvaluated.target_checkpoint !== target &&
    cell.checkpoints.every(cp => checkpointOrder(cp.target_checkpoint, lastEvaluated.target_checkpoint) <= 0 || ['missing', 'stopped_by_policy'].includes(cp.state));
  if (!stopped) return {...unknown('not_reached'), target};
  const explicit = cell.expected_test_counts?.[target]?.total ?? final?.expected_test_counts?.total;
  const sameRevision = peers.filter(other => other.problem === cell.problem && other.mode === 'pipeline' &&
    other.generation === cell.generation && other.evaluation_generation === cell.evaluation_generation && plannedTargets(other).at(-1) === target);
  const totals = [...new Set(sameRevision.map(other => testCounts(other.checkpoints.find(cp => cp.target_checkpoint === target))?.total).filter(value => validCount(value) && value > 0))];
  const total = validCount(explicit) && explicit > 0 ? explicit : totals.length === 1 ? totals[0] : null;
  return {passed: 0, total, target, reason: delivery ? (total == null ? 'delivery_total_unknown' : 'delivery_failure') : (total == null ? 'stopped_total_unknown' : 'structure_stop')};
}

export const fraction = counts => counts && (counts.passed != null || counts.total != null) ? `${counts.passed ?? '—'}/${counts.total ?? '?'}` : '—';
