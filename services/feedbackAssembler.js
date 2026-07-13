/**
 * Feedback assembler — closes the loop for the rolling paid pipeline.
 *
 * Turns the athlete's recent logged sessions + today's check-in + current maxes into (a) the
 * deterministic max adjustments the engine applies, and (b) a compact human-readable summary
 * the weekly AI build reads, so each week adapts to how the athlete actually lifted:
 *   - make-rate per lift (the slowest-moving progress signal — bible §1E)
 *   - recent misses (frequency; feeds "hold the load / insert the corrective" — §7C)
 *   - clean-single / rep-set driven max changes (reuses adapter.js)
 *   - readiness from the check-in (§7A/§9E)
 *
 * Pure; reuses the existing adapter primitives. No DB, no LLM — unit-testable.
 */
const { extractLogged, computeMaxAdjustments, readinessScale } = require('./adapter');

/** Make-rate per classic lift from logged clean singles vs misses (bible §1E progress signal). */
function computeMakeRate(logged) {
  const out = {};
  for (const lift of ['snatch', 'cj']) {
    const L = logged[lift];
    if (!L) continue;
    const made = (L.singlesMade || []).length;
    const missed = (L.misses || []).length;
    const total = made + missed;
    if (total > 0) out[lift] = { made, missed, rate: Math.round((made / total) * 100) };
  }
  return out;
}

const LIFT_LABEL = { snatch: 'snatch', cj: 'clean & jerk', back_squat: 'back squat', front_squat: 'front squat' };

/**
 * @param sessions recent WeeklyTraining docs (most-recent first), each { days: { monday:{exercises:[...]}} }
 * @param checkIn  today's { sleep_quality, stress_level, mental_readiness } or null
 * @param maxes    current stored maxes { snatch, cj, back_squat, front_squat }
 * @returns { logged, maxAdjust, readiness, makeRate, hasHistory, summary }
 */
function assembleFeedback(sessions, checkIn, maxes) {
  const logged = extractLogged(sessions || []);
  const maxAdjust = computeMaxAdjustments(maxes || {}, logged);
  const readiness = readinessScale(checkIn);
  const makeRate = computeMakeRate(logged);
  const hasHistory = Object.keys(logged).length > 0;

  const lines = [];
  for (const [lift, mr] of Object.entries(makeRate)) {
    lines.push(`${LIFT_LABEL[lift]} make-rate ${mr.rate}% recently (${mr.made} made / ${mr.missed} missed)`
      + (mr.rate < 70 ? ' — make-rate is low, keep loads honest and reinforce the corrective, don\'t chase PRs' : ''));
  }
  for (const [lift, adj] of Object.entries(maxAdjust)) {
    const dir = adj.to > adj.from ? 'up' : 'down';
    lines.push(`${LIFT_LABEL[lift]} max adjusted ${dir} ${adj.from}→${adj.to}kg (${adj.reason}) — new percentages run off this`);
  }
  if (readiness.note) lines.push(`today's readiness: ${readiness.note} (cap ~${readiness.cap || 'none'}%)`);
  if (!hasHistory) lines.push('No logged history yet — run the plan as written, slightly conservative, and build a baseline.');

  return { logged, maxAdjust, readiness, makeRate, hasHistory, summary: lines.join('. ') + '.' };
}

module.exports = { assembleFeedback, computeMakeRate };
