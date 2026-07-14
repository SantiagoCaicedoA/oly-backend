/**
 * Metrics layer — aggregates logged sessions into the numbers that power (a) evidence-based
 * coach notes ("your make-rate is up to 85%") and (b) the year-end "Wrapped".
 *
 * Reuses the same logged-session parsing as the feedback loop. Pure; no DB, no LLM.
 * Sessions are WeeklyTraining docs (days map), most-recent first.
 */

const { extractLogged, e1rm } = require('./adapter');
const { extractRichSignals, roundedAvg } = require('./trainingSignals');

const r25 = (w) => Math.round(w / 2.5) * 2.5;
const LIFT_LABEL = { snatch: 'snatch', cj: 'clean & jerk', back_squat: 'back squat', front_squat: 'front squat' };

/** Total kilos moved + set counts across completed sets. */
function tonnageAndCounts(sessions) {
  let tonnage = 0, completedSets = 0, trainingSessions = 0;
  for (const s of sessions || []) {
    let sessionHadWork = false;
    for (const day of Object.values((s && s.days) || {})) {
      if (!day || !Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) for (const set of ex.sets || []) {
        if (!set || !set.isComplete) continue;
        completedSets++; sessionHadWork = true;
        if (typeof set.weight === 'number' && typeof set.reps === 'number') tonnage += set.weight * set.reps;
      }
    }
    if (sessionHadWork) trainingSessions++;
  }
  return { tonnage: Math.round(tonnage), completedSets, trainingSessions };
}

/** Make-rate + best made single (classic) / best e1RM (squats) per lift. */
function perLift(logged) {
  const out = {};
  for (const lift of ['snatch', 'cj']) {
    const L = logged[lift]; if (!L) continue;
    const made = (L.singlesMade || []).length, missed = (L.misses || []).length;
    out[lift] = {
      make_rate: made + missed ? Math.round((made / (made + missed)) * 100) : null,
      best_single: (L.singlesMade || []).length ? Math.max(...L.singlesMade) : null,
    };
  }
  for (const lift of ['back_squat', 'front_squat']) {
    const L = logged[lift]; if (!L || !(L.repSets || []).length) continue;
    const best = Math.max(0, ...L.repSets.filter((s) => s.made).map((s) => e1rm(s.weight, s.reps)));
    if (best > 0) out[lift] = { best_e1rm: r25(best) };
  }
  return out;
}

/** Longest streak of consecutive weeks with a logged training session (sessions sorted desc). */
function weeklyStreak(sessions) {
  const withWork = (sessions || []).filter((s) => {
    for (const d of Object.values((s && s.days) || {})) if (d && Array.isArray(d.exercises) && d.exercises.some((e) => (e.sets || []).some((x) => x && x.isComplete))) return true;
    return false;
  });
  return withWork.length; // sessions are weekly docs; count of weeks with work
}

/**
 * @param sessions WeeklyTraining docs
 * @param baselineMaxes optional {snatch,cj,...} to compute improvement (e.g., onboarding maxes)
 * @returns aggregate metrics object
 */
function aggregate(sessions, baselineMaxes = {}) {
  const logged = extractLogged(sessions || []);
  const { tonnage, completedSets, trainingSessions } = tonnageAndCounts(sessions);
  const lifts = perLift(logged);
  const signals = extractRichSignals(sessions || []);

  // Bar-speed / position averages on the key lifts (evidence for the "why").
  const move = {};
  for (const [name, sig] of Object.entries(signals)) {
    move[name] = { bar_speed_avg: sig.barSpeedAvg, position_avg: sig.positionAvg, made: sig.made, missed: sig.missed, pain: sig.pain };
  }

  // PRs vs baseline (a made single above the baseline max = a PR).
  const prs = [];
  for (const lift of ['snatch', 'cj']) {
    const best = lifts[lift] && lifts[lift].best_single;
    const base = baselineMaxes[lift];
    if (best && base && best > base) prs.push({ lift: LIFT_LABEL[lift], from: base, to: best });
  }

  return {
    sessions: trainingSessions,
    tonnage_kg: tonnage,
    completed_sets: completedSets,
    weeks_with_work: weeklyStreak(sessions),
    per_lift: lifts,
    movement_quality: move,
    prs,
  };
}

/** Compact one-line metrics summary for the coach-note pass ("talk with evidence"). */
function evidenceLine(metrics) {
  const bits = [];
  if (metrics.per_lift.snatch && metrics.per_lift.snatch.make_rate != null) bits.push(`snatch make-rate ${metrics.per_lift.snatch.make_rate}%`);
  if (metrics.per_lift.cj && metrics.per_lift.cj.make_rate != null) bits.push(`C&J make-rate ${metrics.per_lift.cj.make_rate}%`);
  for (const pr of metrics.prs) bits.push(`${pr.lift} PR ${pr.from}→${pr.to}kg`);
  if (metrics.tonnage_kg) bits.push(`${metrics.tonnage_kg.toLocaleString()}kg moved over ${metrics.sessions} sessions`);
  return bits.join('; ');
}

module.exports = { aggregate, evidenceLine, tonnageAndCounts, perLift };
