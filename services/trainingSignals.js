/**
 * Training signals — parses the RICH per-set data the app collects (bar speed, position quality,
 * misses + miss direction, pain + severity) from logged sessions into per-exercise signals.
 * Shared by the feedback loop (adaptation), the max adapter (velocity), and the metrics layer.
 *
 * bar_speed / position_quality scale: Poor(1) < Acceptable(2) < Good(3) < Excellent(4).
 * Pure; no DB, no LLM.
 */

const SIGNAL_SCORE = { Poor: 1, Acceptable: 2, Good: 3, Excellent: 4 };
const BAR_SPEED_LABEL = { 1: 'grinding', 2: 'a bit slow', 3: 'fast enough', 4: 'explosive' };
const POSITION_LABEL = { 1: 'positions breaking down', 2: 'positions shaky', 3: 'positions holding', 4: 'positions locked in' };
// Pain severity — the EXACT values the app's Pain Level selector emits.
const PAIN_RANK = { Minor: 1, Moderate: 2, Sharp: 3 };
const SEVERE_PAIN = 'Sharp';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const roundedAvg = (a) => { const m = avg(a); return m == null ? null : Math.round(m * 100) / 100; };
const worstPain = (levels) => levels.reduce((w, l) => ((PAIN_RANK[l] || 0) > (PAIN_RANK[w] || 0) ? l : w), null);

// Map the app's EXACT miss-capture values (missed_where + where_did_it_fail) to the corrective direction.
const MISS_CORRECTIVE = {
  // "MISSED WHERE?" — In front / Behind / Left / Right
  'in front': 'misses landing IN FRONT → stay over the bar: pause snatch/clean at the knee, no-feet, tempo/halting pulls, RDLs',
  'behind': 'misses landing BEHIND → control the finish: overhead squat, snatch balance, bar-path/tempo work',
  'left': 'misses drifting LEFT → overhead stability + symmetry: snatch balance, OHS, unilateral work; check the setup',
  'right': 'misses drifting RIGHT → overhead stability + symmetry: snatch balance, OHS, unilateral work; check the setup',
  // "WHERE DID IT FAIL?" — Pull / Turnover / Catch / overhead
  'pull': 'failing in the PULL → pulling strength + positions: deficit/segment pulls, pause at the knee, RDLs',
  'turnover': 'failing on the TURNOVER → get under faster: tall/no-feet snatch, high-hang, drop snatch, speed pulls',
  'catch / overhead': 'failing at the CATCH / overhead → overhead squat, snatch balance, drop snatch, jerk support/pause jerk',
};
function missCorrective(direction) {
  return MISS_CORRECTIVE[String(direction || '').toLowerCase().trim()] || null;
}

/**
 * @param sessions recent WeeklyTraining docs, each { days: { monday:{exercises:[...]}, ... } }
 * @returns { [exercise_name]: { sets, made, missed, barSpeedAvg, positionAvg, pain, painAreas, painCount, painLevel, missDirections } }
 */
function extractRichSignals(sessions) {
  const byEx = {};
  for (const s of sessions || []) {
    for (const day of Object.values((s && s.days) || {})) {
      if (!day || !Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        const name = ex && ex.exercise_name;
        if (!name) continue;
        const r = (byEx[name] = byEx[name] || { barSpeed: [], position: [], painCount: 0, painAreas: new Set(), painLevels: [], missDirs: [], sets: 0, made: 0, missed: 0 });
        for (const set of ex.sets || []) {
          if (!set || !set.isComplete) continue;
          r.sets++;
          if (set.was_it_a_miss) {
            r.missed++;
            if (set.missed_where) r.missDirs.push(set.missed_where);
            if (set.where_did_it_fail) r.missDirs.push(set.where_did_it_fail);
          } else r.made++;
          if (SIGNAL_SCORE[set.bar_speed]) r.barSpeed.push(SIGNAL_SCORE[set.bar_speed]);
          if (SIGNAL_SCORE[set.position_quality]) r.position.push(SIGNAL_SCORE[set.position_quality]);
          if (set.any_pain_or_discomfort) {
            r.painCount++;
            (Array.isArray(set.pain_where) ? set.pain_where : []).forEach((a) => a && r.painAreas.add(a));
            if (set.pain_level) r.painLevels.push(set.pain_level);
          }
        }
      }
    }
  }
  const out = {};
  for (const [name, r] of Object.entries(byEx)) {
    if (!r.sets) continue;
    out[name] = {
      sets: r.sets, made: r.made, missed: r.missed,
      barSpeedAvg: roundedAvg(r.barSpeed), positionAvg: roundedAvg(r.position),
      pain: r.painCount > 0, painAreas: [...r.painAreas], painCount: r.painCount, painLevel: worstPain(r.painLevels),
      missDirections: r.missDirs,
    };
  }
  return out;
}

module.exports = { SIGNAL_SCORE, PAIN_RANK, SEVERE_PAIN, BAR_SPEED_LABEL, POSITION_LABEL, extractRichSignals, missCorrective, avg, roundedAvg };
