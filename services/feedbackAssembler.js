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
const { extractRichSignals, missCorrective, SEVERE_PAIN, BAR_SPEED_LABEL, POSITION_LABEL } = require('./trainingSignals');
const KEY_LIFTS = ['Snatch', 'Clean & Jerk', 'Clean & jerk'];

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
function assembleFeedback(sessions, checkIn, maxes, appliedMaxAdjust = null) {
  const logged = extractLogged(sessions || []);
  // Prefer the adjustments that were ACTUALLY applied (so we can narrate "raised your snatch to X"
  // even after the profile max was already updated); otherwise recompute.
  const maxAdjust = appliedMaxAdjust && Object.keys(appliedMaxAdjust).length
    ? appliedMaxAdjust
    : computeMaxAdjustments(maxes || {}, logged);
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

  // ---- Rich signals: bar speed, position quality, pain (feedback v2) ----
  const signals = extractRichSignals(sessions || []);
  const painFlags = [];
  for (const [name, sig] of Object.entries(signals)) {
    if (sig.pain) {
      painFlags.push({ exercise: name, areas: sig.painAreas, count: sig.painCount, level: sig.painLevel });
      const sev = sig.painLevel ? `${sig.painLevel.toUpperCase()} pain` : 'pain';
      const action = sig.painLevel === SEVERE_PAIN ? 'REMOVE / substitute this movement' : 'reduce load or substitute';
      lines.push(`${sev} on ${name}${sig.painAreas.length ? ' (' + sig.painAreas.join(', ') + ')' : ''} — ${action} and check in with the athlete`);
    }
    // Miss-direction → the corrective DIRECTION (bible fault taxonomy). Highest exercise-selection signal.
    if (sig.missDirections && sig.missDirections.length >= 2) {
      const dir = missCorrective(sig.missDirections[sig.missDirections.length - 1]);
      if (dir) lines.push(`${name}: ${dir}`);
    }
  }
  for (const name of KEY_LIFTS) {
    const sig = signals[name];
    if (!sig) continue;
    if (sig.barSpeedAvg != null) {
      const tag = sig.barSpeedAvg >= 3.5 ? ' — moving fast, room to push' : sig.barSpeedAvg < 2.5 ? ' — grinding, hold or ease the load (don\'t just add %)' : '';
      lines.push(`${name}: bar speed ${BAR_SPEED_LABEL[Math.round(sig.barSpeedAvg)]} (avg ${sig.barSpeedAvg}/4)${tag}`);
    }
    if (sig.positionAvg != null) {
      const tag = sig.positionAvg < 2.5 ? ' — reinforce the corrective, hold the load' : sig.positionAvg >= 3.5 ? ' — corrective is working, can progress' : '';
      lines.push(`${name}: ${POSITION_LABEL[Math.round(sig.positionAvg)]} (avg ${sig.positionAvg}/4)${tag}`);
    }
  }

  if (!hasHistory) lines.push('No logged history yet — run the plan as written, slightly conservative, and build a baseline.');

  return { logged, maxAdjust, readiness, makeRate, signals, painFlags, hasHistory, summary: lines.join('. ') + '.' };
}

module.exports = { assembleFeedback, computeMakeRate };
