export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const groupKey = cell => JSON.stringify([cell.model, cell.agent, cell.agent_version, cell.agent_config, cell.thinking, cell.protocol]);
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
  const headers = ['problem','model','agent','agent_version','mode','prompt_arm','repeat','status','outcome','score','official_cost_all_attempts','cost_coverage','agent_invocations','agent_retries'];
  const quote = value => {let text=String(value ?? ''); if (/^[=+@\-]/.test(text)) text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [headers,...cells.map(c=>headers.map(h=>c[h]))].map(row=>row.map(quote).join(',')).join('\r\n');
}
