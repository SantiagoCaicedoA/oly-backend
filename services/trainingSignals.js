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
const PAIN_RANK = { Mild: 1, Moderate: 2, Severe: 3 };

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const roundedAvg = (a) => { const m = avg(a); return m == null ? null : Math.round(m * 100) / 100; };
const worstPain = (levels) => levels.reduce((w, l) => ((PAIN_RANK[l] || 0) > (PAIN_RANK[w] || 0) ? l : w), null);

// Map a logged miss direction/location to the corrective DIRECTION (bible fault taxonomy).
const MISS_CORRECTIVE = [
  { re: /forward|loop|swing|over.?toes/i, dir: 'misses drifting FORWARD → stay over the bar: pause snatch/clean at knee, no-feet, tempo/halting pulls, RDLs' },
  { re: /press|lock.?out|overhead|unstable|out$/i, dir: 'PRESS-OUT / unstable overhead → overhead squat, snatch balance, drop snatch, jerk support/pause jerk' },
  { re: /behind|back(ward)?/i, dir: 'missing BACKWARD → overhead squat, snatch balance, bar-path/tempo work' },
  { re: /high|soft|shallow|depth|receiv|crash/i, dir: 'catching HIGH / shallow → get under: no-feet, tall, drop snatch, snatch balance, bottom pauses' },
  { re: /floor|first.?pull|slow.?off|weak.?pull/i, dir: 'weak/slow first pull → deficit pulls, halting/pause pulls, back strength' },
];
function missCorrective(direction) {
  for (const m of MISS_CORRECTIVE) if (m.re.test(String(direction || ''))) return m.dir;
  return null;
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
            const md = set.missed_where || set.where_did_it_fail;
            if (md) r.missDirs.push(md);
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

module.exports = { SIGNAL_SCORE, PAIN_RANK, BAR_SPEED_LABEL, POSITION_LABEL, extractRichSignals, missCorrective, avg, roundedAvg };
